import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { createResponse, errorResponse } from "../../shared/utils";
import { AddReviewBody, UpdateReviewBody } from "../../shared/types";

const client = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.TABLE_NAME!;

const formatReview = (item: Record<string, any>) => ({
  movieId: item.movieId,
  reviewerId: item.reviewerId,
  date: item.publishedDate,
  text: item.text,
});

// email passed from custom authorizer via context
const getReviewerId = (event: APIGatewayProxyEvent): string | null => {
  return event.requestContext?.authorizer?.email ?? null;
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;
  const params = event.pathParameters || {};
  const query = event.queryStringParameters || {};

  console.log("[EVENT]", event);

  try {

    // GET /reviews?movie=movieId&published=date
    if (method === "GET" && path === "/reviews") {
      const { movie, published } = query;

      if (!movie || !published) {
        return errorResponse(400, "movie and published query params are required");
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "PublishedIndex",
        KeyConditionExpression: "pk = :pk AND begins_with(publishedDate, :date)",
        ExpressionAttributeValues: {
          ":pk": `m#${movie}`,
          ":date": published,
        },
      }));

      return createResponse(200, { reviews: result.Items?.map(formatReview) ?? [] });
    }

    // GET /movies/{movieId}/reviews?reviewer=reviewerId
    if (method === "GET" && params.movieId) {
      const { movieId } = params;
      const reviewerId = query.reviewer;

      // return single review if reviewer query param passed
      if (reviewerId) {
        const result = await ddb.send(new GetCommand({
          TableName: TABLE,
          Key: { pk: `m#${movieId}`, sk: `r#${reviewerId}` },
        }));

        if (!result.Item) return errorResponse(404, "review not found");
        return createResponse(200, { review: formatReview(result.Item) });
      }

      // get all reviews for this movie
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `m#${movieId}`,
          ":prefix": "r#",
        },
      }));

      return createResponse(200, { reviews: result.Items?.map(formatReview) ?? [] });
    }

     // POST /movies/reviews - auth required
    if (method === "POST" && path.endsWith("/movies/reviews")) {
      const reviewerId = getReviewerId(event);
      if (!reviewerId) return errorResponse(401, "unauthorized");

      const body: AddReviewBody = JSON.parse(event.body || "{}");
      const { movieId, text, date } = body;

      if (!movieId || !text || !date) {
        return errorResponse(400, "movieId, review and date are required");
      }

      await ddb.send(new PutCommand({
        TableName: TABLE,
        ConditionExpression: "attribute_not_exists(pk)",
        Item: {
          pk: `m#${movieId}`,
          sk: `r#${reviewerId}`,
          movieId: Number(movieId),
          reviewerId,
          publishedDate: date,
          text,
        },
      }));

      return createResponse(201, { message: "review added successfully" });
    }

    // PUT /movies/{movieId}/reviews - auth required, own review only
    if (method === "PUT" && params.movieId) {
      const reviewerId = getReviewerId(event);
      if (!reviewerId) return errorResponse(401, "unauthorized");

      const body: UpdateReviewBody = JSON.parse(event.body || "{}");
      const { text } = body;

      if (!text) return errorResponse(400, "text is required");

      // check review exists first
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { pk: `m#${params.movieId}`, sk: `r#${reviewerId}` },
      }));

      if (!existing.Item) return errorResponse(404, "review not found");

      // only allow updating your own review
      if (existing.Item.reviewerId !== reviewerId) {
        return errorResponse(403, "you can only update your own reviews");
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `m#${params.movieId}`, sk: `r#${reviewerId}` },
        UpdateExpression: "SET #t = :text",
        ExpressionAttributeNames: { "#t": "text" },
        ExpressionAttributeValues: { ":text": text },
      }));

      return createResponse(200, { message: "review updated successfully" });
    }

    return errorResponse(404, "route not found");

  } catch (err: any) {
    console.error(err);
    return errorResponse(500, "internal server error");
  }
 
};
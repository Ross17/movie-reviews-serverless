import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { createResponse, errorResponse } from "../../shared/utils";

const client = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.TABLE_NAME!;

const formatReview = (item: Record<string, any>) => ({
  movieId: item.movieId,
  reviewerId: item.reviewerId,
  date: item.publishedDate,
  text: item.text,
});

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

    return errorResponse(404, "route not found");

  } catch (err: any) {
    console.error(err);
    return errorResponse(500, "internal server error");
  }
};
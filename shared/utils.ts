import { APIGatewayProxyResult } from "aws-lambda";

// just a helper so i dont have to repeat this everywhere
export const createResponse = (statusCode: number, body: object): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(body),
  };
};

// quick error response
export const errorResponse = (statusCode: number, message: string): APIGatewayProxyResult => {
  return createResponse(statusCode, { message });
};
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, errorResponse } from "../types/utils";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const CLIENT_ID = process.env.USER_POOL_CLIENT!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const path = event.path;
  let body: any = {};

  // parse body if exists
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return errorResponse(400, "invalid json body");
  }

  // POST /auth/register
  if (path.endsWith("/register")) {
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return errorResponse(400, "email, password and name are all required");
    }

    try {
      await cognitoClient.send(new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "name", Value: name },
        ],
      }));

      return createResponse(201, { message: "registered successfully, check email for confirmation code" });
    } catch (err: any) {
      return errorResponse(400, err.message);
    }
  }

  // POST /auth/confirm
  // cognito sends a 6 digit code to email after signup
  if (path.endsWith("/confirm")) {
    const { email, code } = body;

    if (!email || !code) {
      return errorResponse(400, "email and code required");
    }

    try {
      await cognitoClient.send(new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      }));

      return createResponse(200, { message: "account confirmed, you can now login" });
    } catch (err: any) {
      return errorResponse(400, err.message);
    }
  }

  // POST /auth/login
  if (path.endsWith("/login")) {
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse(400, "email and password required");
    }

    try {
      const result = await cognitoClient.send(new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }));

      return createResponse(200, {
        message: "login successful",
        // use this token in Authorization header for POST and PUT requests
        token: result.AuthenticationResult?.IdToken,
        accessToken: result.AuthenticationResult?.AccessToken,
      });
    } catch (err: any) {
      return errorResponse(401, err.message);
    }
  }

  // POST /auth/logout
  if (path.endsWith("/logout")) {
    // need the access token not the id token for signout
    const accessToken = event.headers?.Authorization?.replace("Bearer ", "") || body.accessToken;

    if (!accessToken) {
      return errorResponse(400, "access token required for logout");
    }

    try {
      await cognitoClient.send(new GlobalSignOutCommand({
        AccessToken: accessToken,
      }));

      return createResponse(200, { message: "logged out" });
    } catch (err: any) {
      return errorResponse(400, err.message);
    }
  }

  return errorResponse(404, "auth route not found");
};
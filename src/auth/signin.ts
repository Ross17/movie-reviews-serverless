import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import Ajv from "ajv";
import { SigninBody } from "../../shared/types";

const ajv = new Ajv();
const client = new CognitoIdentityProviderClient({ region: process.env.REGION });
const CLIENT_ID = process.env.CLIENT_ID!;

// validate signin body
const isValidSigninBody = ajv.compile<SigninBody>({
  type: "object",
  properties: {
    email: { type: "string" },
    password: { type: "string" },
  },
  required: ["email", "password"],
});

// POST /auth/signin
export const signinHandler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    console.log("[EVENT]", event);
    const body = event.body ? JSON.parse(event.body) : undefined;

    if (!isValidSigninBody(body)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "invalid request body", errors: isValidSigninBody.errors }),
      };
    }

    const result = await client.send(new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: body.email,
        PASSWORD: body.password,
      },
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "signin successful",
        // use IdToken as Bearer token for protected routes
        token: result.AuthenticationResult?.IdToken,
        // use AccessToken for signout
        accessToken: result.AuthenticationResult?.AccessToken,
      }),
    };
  } catch (err: any) {
    console.error(err);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: err.message }),
    };
  }
};

// POST /auth/signout
export const signoutHandler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    console.log("[EVENT]", event);

    // need access token not id token for signout
    const token = event.headers?.Authorization || event.headers?.authorization;
    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "no token provided" }),
      };
    }

    await client.send(new GlobalSignOutCommand({
      AccessToken: token.replace("Bearer ", ""),
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "signout successful" }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err }),
    };
  }
};
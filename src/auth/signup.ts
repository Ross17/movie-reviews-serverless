import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import Ajv from "ajv";
import { RegisterBody, ConfirmBody } from "../../shared/types";

const ajv = new Ajv();
const client = new CognitoIdentityProviderClient({ region: process.env.REGION });
const CLIENT_ID = process.env.CLIENT_ID!;

// validate register body
const isValidRegisterBody = ajv.compile<RegisterBody>({
  type: "object",
  properties: {
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string" },
  },
  required: ["email", "password", "name"],
});

// validate confirm body
const isValidConfirmBody = ajv.compile<ConfirmBody>({
  type: "object",
  properties: {
    email: { type: "string" },
    code: { type: "string" },
  },
  required: ["email", "code"],
});

// POST /auth/signup
export const signupHandler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    console.log("[EVENT]", event);
    const body = event.body ? JSON.parse(event.body) : undefined;

    if (!isValidRegisterBody(body)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "invalid request body", errors: isValidRegisterBody.errors }),
      };
    }

    await client.send(new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: body.email,
      Password: body.password,
      UserAttributes: [
        { Name: "email", Value: body.email },
        { Name: "name", Value: body.name },
      ],
    }));

    return {
      statusCode: 201,
      body: JSON.stringify({ message: "user registered, check email for confirmation code" }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err }),
    };
  }
};

// POST /auth/confirm-signup
export const confirmSignupHandler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    console.log("[EVENT]", event);
    const body = event.body ? JSON.parse(event.body) : undefined;

    if (!isValidConfirmBody(body)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "invalid request body", errors: isValidConfirmBody.errors }),
      };
    }

    await client.send(new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: body.email,
      ConfirmationCode: body.code,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "account confirmed, you can now signin" }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err }),
    };
  }
};
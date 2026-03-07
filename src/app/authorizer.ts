import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from "aws-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  tokenUse: "id",
  clientId: process.env.CLIENT_ID!,
});

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  console.log("[EVENT]", event);

  const token = event.authorizationToken.replace("Bearer ", "");

  try {
    // verify token against cognito user pool
    const payload = await verifier.verify(token);
    console.log("[PAYLOAD]", payload);

    return generatePolicy("Allow", event.methodArn, payload.email as string);
  } catch (err) {
    console.error("[ERROR]", err);
    return generatePolicy("Deny", event.methodArn);
  }
};

// generates iam policy to allow or deny access to api gateway
const generatePolicy = (effect: "Allow" | "Deny", resource: string, email?: string): APIGatewayAuthorizerResult => {
  return {
    principalId: email || "user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    // get reviewer id without decoding token again
    context: {
      email: email || "",
    },
  };
};
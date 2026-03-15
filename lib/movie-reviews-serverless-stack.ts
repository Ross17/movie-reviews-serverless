import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class MovieReviewsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // dynamo table - single table design (learned this in class)
    const table = new dynamodb.Table(this, 'MoviesTable', {
      tableName: 'MoviesReviewsTable',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // TODO: change this before production lol
    });

    // need this for the date query - extra marks hopefully
    table.addLocalSecondaryIndex({
      indexName: 'PublishedIndex',
      sortKey: { name: 'publishedDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // cognito setup - took ages to figure out the signInAliases thing
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'MovieReviewsUserPool',
      selfSignUpEnabled: true,
      signInAliases: { email: true, username: false },
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, 
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity:     cdk.Duration.minutes(10),
      refreshTokenValidity: cdk.Duration.days(1),
    });

    // shared layer - not sure if i need this but keeping it anyway
    const sharedLayer = new lambda.LayerVersion(this, 'SharedCodeLayer', {
      code: lambda.Code.fromAsset('layers/shared'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared DynamoDB helpers and types',
    });

    // putting common stuff here so i dont repeat myself
    const commonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_20_X,
      layers: [sharedLayer],
      bundling: {
        externalModules: [],
      },
    };

    const authEnv = {
      USER_POOL_ID: userPool.userPoolId,
      CLIENT_ID: userPoolClient.userPoolClientId,
      REGION: this.region,
    };

    // auth lambdas
    const signupLambda = new nodeLambda.NodejsFunction(this, 'SignupFn', {
      ...commonFnProps,
      entry: path.join(__dirname, '../src/auth/signup.ts'),
      handler: 'signupHandler',
      environment: authEnv,
    });

    const confirmSignupLambda = new nodeLambda.NodejsFunction(this, 'ConfirmSignupFn', {
      ...commonFnProps,
      entry: path.join(__dirname, '../src/auth/signup.ts'),
      handler: 'confirmSignupHandler',
      environment: authEnv,
    });

    const signinLambda = new nodeLambda.NodejsFunction(this, 'SigninFn', {
      ...commonFnProps,
      entry: path.join(__dirname, '../src/auth/signin.ts'),
      handler: 'signinHandler',
      environment: authEnv,
    });

    const signoutLambda = new nodeLambda.NodejsFunction(this, 'SignoutFn', {
      ...commonFnProps,
      entry: path.join(__dirname, '../src/auth/signin.ts'),
      handler: 'signoutHandler',
      environment: authEnv,
    });

    // custom authorizer - this was confusing but finally got it working
    const authorizerLambda = new nodeLambda.NodejsFunction(this, 'AuthorizerFn', {
      ...commonFnProps,
      entry: path.join(__dirname, '../src/app/authorizer.ts'),
      handler: 'handler',
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
        REGION: this.region,
      },
    });

    const customAuthorizer = new apigw.TokenAuthorizer(this, 'CustomAuthorizer', {
      handler: authorizerLambda,
      identitySource: 'method.request.header.Authorization',
    });

    // main app lambda for all the movie review endpoints
    const appLambda = new nodeLambda.NodejsFunction(this, 'AppLambda', {
      ...commonFnProps,
      entry: path.join(__dirname, '../src/app/app.ts'),
      handler: 'handler',
      environment: {
        TABLE_NAME: table.tableName,
        REGION: this.region,
      },
    });
    table.grantReadWriteData(appLambda);

    // auth api - register login logout
    const authApi = new apigw.RestApi(this, 'AuthApiGateway', {
      restApiName: 'Movie-Auth-API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authRes = authApi.root.addResource('auth');
    authRes.addResource('signup').addMethod('POST', new apigw.LambdaIntegration(signupLambda));
    authRes.addResource('confirm-signup').addMethod('POST', new apigw.LambdaIntegration(confirmSignupLambda));
    authRes.addResource('signin').addMethod('POST', new apigw.LambdaIntegration(signinLambda));
    authRes.addResource('signout').addMethod('POST', new apigw.LambdaIntegration(signoutLambda));

    // app api - movie reviews endpoints
    const appApi = new apigw.RestApi(this, 'AppApiGateway', {
      restApiName: 'Movie-Reviews-API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // need auth for post and put
    const authMethodOptions = {
      authorizer: customAuthorizer,
      authorizationType: apigw.AuthorizationType.CUSTOM,
    };

    const moviesRes = appApi.root.addResource('movies');
    const movieIdRes = moviesRes.addResource('{movieId}');
    const reviewsRes = movieIdRes.addResource('reviews');

    reviewsRes.addMethod('GET', new apigw.LambdaIntegration(appLambda)); // public
    reviewsRes.addMethod('PUT', new apigw.LambdaIntegration(appLambda), authMethodOptions); // needs token

    // post is on /movies/reviews not /movies/{movieId}/reviews
    moviesRes.addResource('reviews').addMethod('POST', new apigw.LambdaIntegration(appLambda), authMethodOptions);

    // this one uses query params instead of path params
    appApi.root.addResource('reviews').addMethod('GET', new apigw.LambdaIntegration(appLambda));

    // print urls so i can test in postman
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'AuthApiUrl', { value: authApi.url });
    new cdk.CfnOutput(this, 'AppApiUrl', { value: appApi.url });
  }
}
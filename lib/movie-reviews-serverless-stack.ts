import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class MovieReviewsServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================
    // 1. DYNAMODB - Single Table Design
    // =========================================
    const table = new dynamodb.Table(this, 'MoviesTable', {
      tableName: 'MoviesReviewsTable',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode:  dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // LSI for GET /reviews?movie=&published= query
    table.addLocalSecondaryIndex({
      indexName:  'PublishedIndex',
      sortKey:    { name: 'publishedDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // =========================================
    // 2. COGNITO - User Pool + Client
    // =========================================
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName:     'MovieReviewsUserPool',
      selfSignUpEnabled: true,
      signInAliases:    { email: true },
      autoVerify:       { email: true },
      passwordPolicy: {
        minLength:        8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits:    true,
        requireSymbols:   false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp:      true,
      },
      generateSecret: false,
    });

    // =========================================
    // 3. LAMBDA LAYER - Shared code
    // =========================================
    const sharedLayer = new lambda.LayerVersion(this, 'SharedCodeLayer', {
      code: lambda.Code.fromAsset('layers/shared'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared DynamoDB helpers and types',
    });

    // =========================================
    // 4. LAMBDA FUNCTIONS
    // =========================================
    const authLambda = new nodeLambda.NodejsFunction(this, 'AuthLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry:   path.join(__dirname, '../src/auth/auth.ts'),
      handler: 'handler',
      layers:  [sharedLayer],
      environment: {
        TABLE_NAME:       table.tableName,
        USER_POOL_ID:     userPool.userPoolId,
        USER_POOL_CLIENT: userPoolClient.userPoolClientId,
        REGION:           this.region,
      },
    });
    table.grantReadWriteData(authLambda);

    const appLambda = new nodeLambda.NodejsFunction(this, 'AppLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry:   path.join(__dirname, '../src/app/app.ts'),
      handler: 'handler',
      layers:  [sharedLayer],
      environment: {
        TABLE_NAME: table.tableName,
        REGION:     this.region,
      },
    });
    table.grantReadWriteData(appLambda);

    // =========================================
    // 5. COGNITO AUTHORIZER
    // =========================================
    const cognitoAuthorizer = new apigw.CognitoUserPoolsAuthorizer(
      this, 'CognitoAuthorizer', {
        cognitoUserPools: [userPool],
        identitySource:   'method.request.header.Authorization',
      }
    );

    // =========================================
    // 6. AUTH API GATEWAY
    // =========================================
    const authApi = new apigw.RestApi(this, 'AuthApiGateway', {
      restApiName: 'Movie-Auth-API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authRes = authApi.root.addResource('auth');
    authRes.addResource('register').addMethod('POST', new apigw.LambdaIntegration(authLambda));
    authRes.addResource('confirm').addMethod('POST',  new apigw.LambdaIntegration(authLambda));
    authRes.addResource('login').addMethod('POST',    new apigw.LambdaIntegration(authLambda));
    authRes.addResource('logout').addMethod('POST',   new apigw.LambdaIntegration(authLambda));

    // =========================================
    // 7. APP API GATEWAY
    // =========================================
    const appApi = new apigw.RestApi(this, 'AppApiGateway', {
      restApiName: 'Movie-Reviews-API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authMethodOptions = {
      authorizer:        cognitoAuthorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    // GET  /movies/{movieId}/reviews
    // PUT  /movies/{movieId}/reviews  ← auth required
    const moviesRes  = appApi.root.addResource('movies');
    const movieIdRes = moviesRes.addResource('{movieId}');
    const reviewsRes = movieIdRes.addResource('reviews');
    reviewsRes.addMethod('GET', new apigw.LambdaIntegration(appLambda));
    reviewsRes.addMethod('PUT', new apigw.LambdaIntegration(appLambda), authMethodOptions);

    // POST /movies/reviews  ← auth required
    moviesRes.addResource('reviews')
      .addMethod('POST', new apigw.LambdaIntegration(appLambda), authMethodOptions);

    // GET /reviews?movie=&published=
    appApi.root.addResource('reviews')
      .addMethod('GET', new apigw.LambdaIntegration(appLambda));

    // =========================================
    // 8. OUTPUTS
    // =========================================
    new cdk.CfnOutput(this, 'UserPoolId',       { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'AuthApiUrl',        { value: authApi.url });
    new cdk.CfnOutput(this, 'AppApiUrl',         { value: appApi.url });
  }
}
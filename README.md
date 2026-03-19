# Welcome to your CDK TypeScript project

The `cdk.json` file tells the CDK Toolkit how to execute your app.

# Movie Reviews Serverless API

A serverless REST API for managing movie reviews built with AWS CDK and TypeScript for the Enterprise Web Development assignment.

## Tech Stack

- **AWS CDK** - Infrastructure as code
- **AWS Lambda** - Serverless functions
- **AWS API Gateway** - REST API endpoints
- **AWS DynamoDB** - Single table design database
- **AWS Cognito** - User authentication
- **TypeScript** - Language used throughout

## Project Structure

movie-reviews-serverless/
├── bin/                  - CDK app entry point
├── layers/shared/        - Lambda layer
├── lib/                  - CDK stack definition
├── seed/                 - Database seed scripts
├── shared/               - Shared types and utilities
├── src/
│   ├── auth/             - Auth lambda functions
│   │   ├── signup.ts     - Register and confirm signup
│   │   └── signin.ts     - Signin and signout
│   └── app/
│       ├── app.ts        - Movie review endpoints
│       └── authorizer.ts - Custom JWT authorizer
└── postman/              - Postman collection and environment


## Architecture

The app has two separate APIs:

- **Auth API** - Handles user registration, confirmation, signin and signout using Cognito
- **App API** - Handles movie review endpoints, protected by a custom authorizer lambda

### Custom Authorizer Flow

Request with Bearer token
        ↓
API Gateway triggers Authorizer Lambda
        ↓
Authorizer verifies token against Cognito
        ↓
Extracts email from JWT claims
        ↓
Passes email to App Lambda via context
        ↓
App Lambda uses email as reviewerId


## Database Design

Single table design pattern - Only single DynamoDB table stores all entities.

**Table Name:** MoviesReviewsTable

| Entity   | PK           | SK           |
|----------|--------------|--------------|
| Movie    | m#movieId    | m#movieId    |
| Reviewer | r#email      | r#email      |
| Review   | m#movieId    | r#email      |

### Sample Items

Movie:
json
{
  "pk": "m#1234",
  "sk": "m#1234",
  "title": "The Shawshank Redemption",
  "date": "1995-03-01",
  "overview": "A banker convicted of uxoricide..."
}

Review:
json
{
  "pk": "m#1234",
  "sk": "r#user@test.com",
  "movieId": 1234,
  "reviewerId": "user@test.com",
  "publishedDate": "2024-01-15",
  "text": "Moving and inspirational!"
}

### LSI - Local Secondary Index

A Local Secondary Index (`PublishedIndex`) is added on `publishedDate` for efficient date-based queries on `GET /reviews?movie=&published=` without scanning the whole table.

## Setup Instructions

### Prerequisites

- Node.js 20+
- AWS CLI configured with valid credentials
- AWS CDK installed globally

npm install -g aws-cdk

### Deploy

# install dependencies
npm install

# bootstrap CDK (first time only)
cdk bootstrap

# deploy stack
cdk deploy

### Seed Movies

npx ts-node seed/seedMovies.ts


## API Endpoints

### Auth API

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /auth/signup | Register new user | ❌ |
| POST | /auth/confirm-signup | Confirm email with code | ❌ |
| POST | /auth/signin | Login and get tokens | ❌ |
| POST | /auth/signout | Logout | ✅ |

### App API

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /movies/{movieId}/reviews | Get all reviews for a movie | ❌ |
| GET | /movies/{movieId}/reviews?reviewer=email | Get review by specific reviewer | ❌ |
| GET | /reviews?movie=movieId&published=date | Get reviews by date | ❌ |
| POST | /movies/reviews | Add a review | ✅ |
| PUT | /movies/{movieId}/reviews | Update a review | ✅ |

## Testing

### Register and Login
# register
curl -X POST https://<AUTH_URL>/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@test.com", "password": "Test1234!", "name": "Test User"}'

# confirm signup
curl -X POST https://<AUTH_URL>/auth/confirm-signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@test.com", "code": "123456"}'

# signin - copy the token from response
curl -X POST https://<AUTH_URL>/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email": "user@test.com", "password": "Test1234!"}'

### Movie Reviews

# get all reviews for a movie
curl https://<APP_URL>/movies/1234/reviews

# get review by specific reviewer
curl "https://<APP_URL>/movies/1234/reviews?reviewer=user@test.com"

# get reviews by date
curl "https://<APP_URL>/reviews?movie=1234&published=1995"

# add a review
curl -X POST https://<APP_URL>/movies/reviews \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"movieId": 1234, "text": "Great movie!", "date": "2024-01-15"}'

# update a review
curl -X PUT https://<APP_URL>/movies/1234/reviews \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"text": "Updated review text!"}'

## Authentication

- Use `token` (IdToken) as Bearer token for POST and PUT requests
- Use `accessToken` for signout only
- Tokens expire after 60 minutes
- Reviewers can only update their own reviews
- Reviewer ID is extracted from JWT token automatically - not required in request body

## Seed Data

The following movies are available by default after running the seed script:

| movieId | Title |
|---------|-------|
| 1234 | The Shawshank Redemption |
| 5678 | The Godfather |
| 9999 | Inception |
| 1111 | The Dark Knight |
| 2222 | Pulp Fiction |

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

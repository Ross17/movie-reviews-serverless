import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import * as fs from "fs";
import * as path from "path";

const client = new DynamoDBClient({ region: "eu-west-1" });
const ddb = DynamoDBDocumentClient.from(client);

const TABLE = "MoviesReviewsTable";

// read movies from json file
const movies = JSON.parse(
  fs.readFileSync(path.join(__dirname, "movies.json"), "utf-8")
);

const seedMovies = async () => {
  console.log("seeding movies...");

  for (const movie of movies) {
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: movie,
      }));
      console.log(`added: ${movie.title}`);
    } catch (err) {
      console.error(`failed to add ${movie.title}:`, err);
    }
  }

  console.log("done!");
};

seedMovies();
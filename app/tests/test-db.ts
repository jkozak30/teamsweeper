import { MongoClient, type Db } from "mongodb";

export interface TestDb {
  db: Db;
  close(): Promise<void>;
}

export async function openTestDb(): Promise<TestDb> {
  const url = process.env.MONGODB_URL;

  if (!url) {
    throw new Error(
      "MONGODB_URL is not set. Add it to .env and run tests from app/.",
    );
  }

  const client = new MongoClient(url, {
    serverSelectionTimeoutMS: 3000,
  });

  try {
    await client.connect();
  } catch (error) {
    await client.close();
    throw new Error(
      "Could not reach MongoDB. Start it with bun run db:up.",
      { cause: error },
    );
  }

  // Separate from the application's database.
  const db = client.db(`teamsweeper_test_${crypto.randomUUID()}`);

  return {
    db,
    async close() {
      try {
        await db.dropDatabase();
      } finally {
        await client.close();
      }
    },
  };
}
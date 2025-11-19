import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// Initialize a single PG pool from DATABASE_URL
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optional: enable SSL when DATABASE_URL points to a managed Postgres
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool);




// server/storage-db.ts
import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import type { InsertUser, User, InsertFoodEntry, FoodEntry, InsertFoodItem, FoodItem, ChatMessage, InsertChatMessage } from "@shared/schema";
import type { IStorage } from "./storage";
import { randomUUID } from "crypto";

// Lazy-initialized MySQL connection pool
let pool: Pool | null = null;

function createMysqlPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required for MySQL connection");
  }
  
  if (!pool) {
    // Remove PostgreSQL-specific parameters from the connection string
    let connectionString = process.env.DATABASE_URL;
    
    try {
      const url = new URL(connectionString);
      const paramsToRemove = ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey'];
      
      paramsToRemove.forEach(param => {
        url.searchParams.delete(param);
      });
      
      connectionString = url.toString();
    } catch (error) {
      // If URL parsing fails, use the original connection string
      console.warn('Failed to parse DATABASE_URL, using as-is:', error);
    }
    
    pool = mysql.createPool({
      uri: connectionString,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  
  return pool;
}

// Export drizzle instance for ORM usage
export const db = drizzle(createMysqlPool());

// Helper functions to map between MySQL snake_case and TypeScript camelCase
function mapUserFromDb(dbUser: any): User {
  if (!dbUser) return dbUser;
  return {
    id: dbUser.id,
    username: dbUser.username,
    password: dbUser.password,
    name: dbUser.name,
    age: dbUser.age,
    gender: dbUser.gender,
    height: dbUser.height,
    weight: dbUser.weight,
    goal: dbUser.goal,
    createdAt: dbUser.created_at,
  };
}

function mapFoodEntryFromDb(dbEntry: any): FoodEntry {
  if (!dbEntry) return dbEntry;
  return {
    id: dbEntry.id,
    userId: dbEntry.user_id,
    foodName: dbEntry.food_name,
    calories: dbEntry.calories,
    weight: dbEntry.weight,
    imageUrl: dbEntry.image_url,
    dietComment: dbEntry.diet_comment,
    timestamp: dbEntry.timestamp,
  };
}

function mapFoodItemFromDb(dbItem: any): FoodItem {
  if (!dbItem) return dbItem;
  return {
    id: dbItem.id,
    name: dbItem.name,
    caloriesPer100g: dbItem.calories_per_100g,
    advice: dbItem.advice,
  };
}

function mapChatMessageFromDb(dbMessage: any): ChatMessage {
  if (!dbMessage) return dbMessage;
  return {
    id: dbMessage.id,
    userId: dbMessage.user_id,
    role: dbMessage.role,
    content: dbMessage.content,
    timestamp: dbMessage.timestamp,
  };
}

export class DbStorage implements IStorage {
  private getPool(): Pool {
    return createMysqlPool();
  }

  // === USERS ===
  async getUserByUsername(username: string): Promise<User | undefined> {
    const pool = this.getPool();
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    const data = Array.isArray(rows) ? rows[0] : undefined;
    return data ? mapUserFromDb(data) : undefined;
  }

  async getUser(id: string): Promise<User | undefined> {
    const pool = this.getPool();
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    const data = Array.isArray(rows) ? rows[0] : undefined;
    return data ? mapUserFromDb(data) : undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const pool = this.getPool();
    const id = randomUUID();
    await pool.query(
      `INSERT INTO users (id, username, password, name, age, gender, height, weight, goal, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        user.username,
        user.password,
        user.name,
        user.age,
        user.gender,
        user.height,
        user.weight,
        user.goal,
      ]
    );
    const created = await this.getUser(id);
    if (!created) throw new Error("Create user failed");
    return created;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const pool = this.getPool();
    
    // Filter out undefined values
    const validUpdates = Object.entries(updates).filter(([_, value]) => value !== undefined);
    
    if (validUpdates.length === 0) {
      const user = await this.getUser(id);
      if (!user) throw new Error("User not found");
      return user;
    }
    
    const fields = validUpdates.map(([key]) => `${key} = ?`).join(", ");
    const values = validUpdates.map(([_, value]) => value);
    
    await pool.query(
      `UPDATE users SET ${fields} WHERE id = ?`,
      [...values, id]
    );
    
    const user = await this.getUser(id);
    if (!user) throw new Error("User not found");
    return user;
  }

  // === FOOD ENTRIES ===
  async getFoodEntry(id: string): Promise<FoodEntry | undefined> {
    const pool = this.getPool();
    const [rows] = await pool.query("SELECT * FROM food_entries WHERE id = ?", [id]);
    const data = Array.isArray(rows) ? rows[0] : undefined;
    return data ? mapFoodEntryFromDb(data) : undefined;
  }

  async getFoodEntriesByUser(userId: string): Promise<FoodEntry[]> {
    const pool = this.getPool();
    const [rows] = await pool.query(
      "SELECT * FROM food_entries WHERE user_id = ? ORDER BY timestamp DESC", 
      [userId]
    );
    return Array.isArray(rows) ? rows.map(mapFoodEntryFromDb) : [];
  }

  async createFoodEntry(entry: InsertFoodEntry): Promise<FoodEntry> {
    const pool = this.getPool();
    const id = randomUUID();
    await pool.query(
      `INSERT INTO food_entries (id, user_id, food_name, calories, weight, image_url, diet_comment, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        entry.userId,
        entry.foodName,
        entry.calories,
        entry.weight ?? null,
        entry.imageUrl ?? null,
        entry.dietComment ?? null,
      ]
    );
    const created = await this.getFoodEntry(id);
    if (!created) throw new Error("Create food entry failed");
    return created;
  }

  async deleteFoodEntry(id: string): Promise<boolean> {
    const pool = this.getPool();
    const [result] = await pool.query("DELETE FROM food_entries WHERE id = ?", [id]);
    return (result as any).affectedRows > 0;
  }

  // === FOOD ITEMS ===
  async getFoodItem(id: string): Promise<FoodItem | undefined> {
    const pool = this.getPool();
    const [rows] = await pool.query("SELECT * FROM food_items WHERE id = ?", [id]);
    const data = Array.isArray(rows) ? rows[0] : undefined;
    return data ? mapFoodItemFromDb(data) : undefined;
  }

  async getFoodItemByName(name: string): Promise<FoodItem | undefined> {
    const pool = this.getPool();
    const [rows] = await pool.query("SELECT * FROM food_items WHERE name = ?", [name]);
    const data = Array.isArray(rows) ? rows[0] : undefined;
    return data ? mapFoodItemFromDb(data) : undefined;
  }

  async createFoodItem(item: InsertFoodItem): Promise<FoodItem> {
    const pool = this.getPool();
    const id = randomUUID();
    await pool.query(
      `INSERT INTO food_items (id, name, calories_per_100g, advice)
       VALUES (?, ?, ?, ?)`,
      [
        id,
        item.name,
        item.caloriesPer100g,
        item.advice ?? "Good for your health.",
      ]
    );
    const created = await this.getFoodItem(id);
    if (!created) throw new Error("Create food item failed");
    return created;
  }

  async getAllFoodItems(): Promise<FoodItem[]> {
    const pool = this.getPool();
    const [rows] = await pool.query("SELECT * FROM food_items");
    return Array.isArray(rows) ? rows.map(mapFoodItemFromDb) : [];
  }

  // === CHAT MESSAGES ===
  async getChatMessagesByUser(userId: string): Promise<ChatMessage[]> {
    const pool = this.getPool();
    const [rows] = await pool.query(
      "SELECT * FROM chat_messages WHERE user_id = ? ORDER BY timestamp ASC LIMIT 10",
      [userId]
    );
    return Array.isArray(rows) ? rows.map(mapChatMessageFromDb) : [];
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const pool = this.getPool();
    const id = randomUUID();
    await pool.query(
      `INSERT INTO chat_messages (id, user_id, role, content, timestamp)
       VALUES (?, ?, ?, ?, NOW())`,
      [
        id,
        message.userId,
        message.role,
        message.content,
      ]
    );
    const [rows] = await pool.query("SELECT * FROM chat_messages WHERE id = ?", [id]);
    const data = Array.isArray(rows) ? rows[0] : undefined;
    if (!data) throw new Error("Create chat message failed");
    return mapChatMessageFromDb(data);
  }

  async clearChatHistory(userId: string): Promise<boolean> {
    const pool = this.getPool();
    const [result] = await pool.query("DELETE FROM chat_messages WHERE user_id = ?", [userId]);
    return (result as any).affectedRows > 0;
  }
}

export const storage = new DbStorage();

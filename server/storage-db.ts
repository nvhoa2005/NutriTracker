import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import type { 
  InsertUser, User, 
  InsertFoodEntry, FoodEntry, 
  InsertFoodItem, FoodItem, 
  ChatMessage, InsertChatMessage, 
  Recipe, InsertRecipe 
} from "@shared/schema";
import type { IStorage } from "./storage";
import { randomUUID } from "crypto";

// Lazy-initialized MySQL connection pool
let pool: Pool | null = null;

function createMysqlPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  
  if (!pool) {
    // Tự động clean connection string nếu có tham số thừa của Postgres
    let connectionString = process.env.DATABASE_URL;
    try {
      const url = new URL(connectionString);
      const paramsToRemove = ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey'];
      paramsToRemove.forEach(param => url.searchParams.delete(param));
      connectionString = url.toString();
    } catch (e) { /* Ignore parsing error */ }
    
    pool = mysql.createPool({
      uri: connectionString,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export const db = drizzle(createMysqlPool());

// --- MAPPER FUNCTIONS (Database snake_case -> TypeScript camelCase) ---

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
    foodName: dbEntry.food_name, // Map từ Alias trong câu query JOIN
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

// --- MAIN STORAGE CLASS ---

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
    const [rows] = await pool.query("SELECT id FROM users");
    
    let maxId = 0;
    
    if (Array.isArray(rows)) {
      rows.forEach((row: any) => {
        if (typeof row.id === 'string' && row.id.startsWith('u')) {
          const num = parseInt(row.id.substring(1), 10);
          if (!isNaN(num) && num > maxId) {
            maxId = num;
          }
        }
      });
    }

    const newId = `u${maxId + 1}`;

    await pool.query(
      `INSERT INTO users (id, username, password, name, age, gender, height, weight, goal, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        newId,
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

    const created = await this.getUser(newId);
    if (!created) throw new Error("Create user failed");
    return created;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const pool = this.getPool();
    const validUpdates = Object.entries(updates).filter(([_, value]) => value !== undefined);
    if (validUpdates.length === 0) {
      const user = await this.getUser(id);
      if (!user) throw new Error("User not found");
      return user;
    }
    const fields = validUpdates.map(([key]) => `${key} = ?`).join(", ");
    const values = validUpdates.map(([_, value]) => value);
    await pool.query(`UPDATE users SET ${fields} WHERE id = ?`, [...values, id]);
    return (await this.getUser(id))!;
  }

  // === FOOD ENTRIES ===
  async getFoodEntry(id: string): Promise<FoodEntry | undefined> {
    const pool = this.getPool();
    const [rows] = await pool.query(
      `SELECT fe.*, fi.name as food_name 
      FROM food_entries fe
      LEFT JOIN food_items fi ON fe.food_id = fi.id
      WHERE fe.id = ?`, 
      [id]
    );
    const data = Array.isArray(rows) ? rows[0] : undefined;
    return data ? mapFoodEntryFromDb(data) : undefined;
  }

  async getFoodEntriesByUser(userId: string): Promise<FoodEntry[]> {
    const pool = this.getPool();
    const [rows] = await pool.query(
      `SELECT fe.*, fi.name as food_name, fe.food_id 
      FROM food_entries fe
      LEFT JOIN food_items fi ON fe.food_id = fi.id
      WHERE fe.user_id = ? 
      ORDER BY fe.timestamp DESC`, 
      [userId]
    );
    return Array.isArray(rows) ? rows.map(mapFoodEntryFromDb) : [];
  }

  async createFoodEntry(entry: InsertFoodEntry): Promise<FoodEntry> {
    const pool = this.getPool();
    
    // Logic tạo ID: f{userIdNum}_{sequence}
    const userIdNum = entry.userId.replace(/\D/g, '') || entry.userId; 
    const [existingRows] = await pool.query("SELECT id FROM food_entries WHERE user_id = ?", [entry.userId]);
    let maxSequence = 0;
    if (Array.isArray(existingRows)) {
      existingRows.forEach((row: any) => {
        const parts = row.id.split('_');
        if (parts.length === 2) {
          const sequence = parseInt(parts[1], 10);
          if (!isNaN(sequence) && sequence > maxSequence) maxSequence = sequence;
        }
      });
    }
    const newId = `f${userIdNum}_${maxSequence + 1}`;

    // Logic tìm/tạo foodItem
    let foodItem = await this.getFoodItemByName(entry.foodName);
    if (!foodItem) {
      foodItem = await this.createFoodItem({
        name: entry.foodName,
        caloriesPer100g: 0, 
        advice: entry.dietComment || "Good for your health.",
      });
    }

    await pool.query(
      `INSERT INTO food_entries (id, user_id, food_id, calories, image_url, diet_comment, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [newId, entry.userId, foodItem.id, entry.calories, entry.imageUrl ?? null, entry.dietComment ?? null]
    );

    return (await this.getFoodEntry(newId))!;
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
      `INSERT INTO food_items (id, name, calories_per_100g, advice) VALUES (?, ?, ?, ?)`,
      [id, item.name, item.caloriesPer100g, item.advice ?? "Good for your health."]
    );
    return (await this.getFoodItem(id))!;
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
      "SELECT * FROM chat_messages WHERE user_id = ? ORDER BY timestamp ASC",
      [userId]
    );
    return Array.isArray(rows) ? rows.map(mapChatMessageFromDb) : [];
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const pool = this.getPool();
    const id = randomUUID();
    await pool.query(
      `INSERT INTO chat_messages (id, user_id, role, content, timestamp) VALUES (?, ?, ?, ?, NOW())`,
      [id, message.userId, message.role, message.content]
    );
    const [rows] = await pool.query("SELECT * FROM chat_messages WHERE id = ?", [id]);
    return mapChatMessageFromDb((rows as any)[0]);
  }

  async clearChatHistory(userId: string): Promise<boolean> {
    const pool = this.getPool();
    const [result] = await pool.query("DELETE FROM chat_messages WHERE user_id = ?", [userId]);
    return (result as any).affectedRows > 0;
  }

  // === RECIPES ===
  async getRecipeByName(mealName: string): Promise<Recipe | undefined> {
    const pool = this.getPool();
    // Tìm kiếm chính xác tên món ăn trong bảng recipes
    const [rows] = await pool.query("SELECT * FROM recipes WHERE meal_name = ?", [mealName]);
    
    // [SỬA LỖI GẠCH ĐỎ]: Thêm 'as any' vào rows[0]
    const data = Array.isArray(rows) ? (rows[0] as any) : undefined;
    
    if (data) {
      return {
        id: data.id,
        mealName: data.meal_name,
        // Bây giờ TypeScript sẽ không báo lỗi ở data.data nữa
        data: typeof data.data === 'string' ? JSON.parse(data.data) : data.data,
        createdAt: data.created_at
      };
    }
    return undefined;
  }

  async createRecipe(insertRecipe: InsertRecipe): Promise<Recipe> {
    const pool = this.getPool();
    const id = randomUUID();
    const jsonData = JSON.stringify(insertRecipe.data);
    await pool.query(
      `INSERT INTO recipes (id, meal_name, data, created_at) VALUES (?, ?, ?, NOW())`,
      [id, insertRecipe.mealName, jsonData]
    );
    return {
      id,
      mealName: insertRecipe.mealName,
      data: insertRecipe.data,
      createdAt: new Date()
    };
  }
}

export const storage = new DbStorage();
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
    // JOIN bảng food_entries với food_items để lấy tên món ăn (name as food_name)
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

    // --- BƯỚC 1: Xử lý logic tạo ID mới (Format: f{userIdNum}_{sequence}) ---
    
    // 1. Lấy phần số từ user_id (ví dụ: "u1" -> "1")
    // Dùng regex để chỉ lấy số, phòng trường hợp id phức tạp hơn
    const userIdNum = entry.userId.replace(/\D/g, '') || entry.userId; 

    // 2. Lấy danh sách tất cả ID hiện có của user này để tìm số thứ tự lớn nhất
    const [existingRows] = await pool.query(
      "SELECT id FROM food_entries WHERE user_id = ?",
      [entry.userId]
    );

    let maxSequence = 0;

    if (Array.isArray(existingRows)) {
      existingRows.forEach((row: any) => {
        // ID có dạng f1_10. Ta cần tách lấy phần sau dấu "_"
        const parts = row.id.split('_');
        if (parts.length === 2) {
          const sequence = parseInt(parts[1], 10);
          // Kiểm tra nếu là số hợp lệ và lớn hơn max hiện tại thì cập nhật
          if (!isNaN(sequence) && sequence > maxSequence) {
            maxSequence = sequence;
          }
        }
      });
    }

    // 3. Tạo ID mới = f + userNum + _ + (maxSequence + 1)
    const newId = `f${userIdNum}_${maxSequence + 1}`;

    // --- BƯỚC 2: Xử lý logic tìm food_id (giữ nguyên logic bài trước) ---

    let foodItem = await this.getFoodItemByName(entry.foodName);

    if (!foodItem) {
      foodItem = await this.createFoodItem({
        name: entry.foodName,
        caloriesPer100g: 0, 
        advice: entry.dietComment || "Good for your health.",
      });
    }

    // --- BƯỚC 3: Insert vào DB với ID mới ---

    await pool.query(
      `INSERT INTO food_entries (id, user_id, food_id, calories, image_url, diet_comment, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        newId, // Sử dụng ID vừa tạo theo format f1_11
        entry.userId,
        foodItem.id,
        entry.calories,
        entry.imageUrl ?? null,
        entry.dietComment ?? null,
      ]
    );

    const created = await this.getFoodEntry(newId);
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
      "SELECT * FROM chat_messages WHERE user_id = ? ORDER BY timestamp ASC",
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

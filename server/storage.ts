import { type User, type InsertUser, type FoodEntry, type InsertFoodEntry, type FoodItem, type InsertFoodItem, type ChatMessage, type InsertChatMessage, users, foodEntries, foodItems, chatMessages } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;

  // Food item methods
  getFoodItem(id: string): Promise<FoodItem | undefined>;
  getFoodItemByName(name: string): Promise<FoodItem | undefined>;
  createFoodItem(item: InsertFoodItem): Promise<FoodItem>;
  getAllFoodItems(): Promise<FoodItem[]>;

  // Food entry methods
  getFoodEntry(id: string): Promise<FoodEntry | undefined>;
  getFoodEntriesByUser(userId: string): Promise<FoodEntry[]>;
  createFoodEntry(entry: InsertFoodEntry): Promise<FoodEntry>;
  deleteFoodEntry(id: string): Promise<boolean>;

  // Chat message methods
  getChatMessagesByUser(userId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  clearChatHistory(userId: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private foodItems: Map<string, FoodItem>;
  private foodEntries: Map<string, FoodEntry>;
  private chatMessages: Map<string, ChatMessage>;

  constructor() {
    this.users = new Map();
    this.foodItems = new Map();
    this.foodEntries = new Map();
    this.chatMessages = new Map();
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error("User not found");
    }
    const updatedUser: User = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Food item methods
  async getFoodItem(id: string): Promise<FoodItem | undefined> {
    return this.foodItems.get(id);
  }

  async getFoodItemByName(name: string): Promise<FoodItem | undefined> {
    return Array.from(this.foodItems.values()).find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async createFoodItem(insertItem: InsertFoodItem): Promise<FoodItem> {
    const id = randomUUID();
    const item: FoodItem = {
      ...insertItem,
      id,
      advice: insertItem.advice || "Good for your health.",
    };
    this.foodItems.set(id, item);
    return item;
  }

  async getAllFoodItems(): Promise<FoodItem[]> {
    return Array.from(this.foodItems.values());
  }

  // Food entry methods
  async getFoodEntry(id: string): Promise<FoodEntry | undefined> {
    return this.foodEntries.get(id);
  }

  async getFoodEntriesByUser(userId: string): Promise<FoodEntry[]> {
    return Array.from(this.foodEntries.values())
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createFoodEntry(insertEntry: InsertFoodEntry): Promise<FoodEntry> {
    const id = randomUUID();
    const entry: FoodEntry = {
      ...insertEntry,
      weight: insertEntry.weight ?? null,
      imageUrl: insertEntry.imageUrl ?? null,
      dietComment: insertEntry.dietComment ?? null,
      id,
      timestamp: new Date(),
    };
    this.foodEntries.set(id, entry);
    return entry;
  }

  async deleteFoodEntry(id: string): Promise<boolean> {
    return this.foodEntries.delete(id);
  }

  // Chat message methods
  async getChatMessagesByUser(userId: string): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter((msg) => msg.userId === userId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const message: ChatMessage = {
      ...insertMessage,
      id,
      timestamp: new Date(),
    };
    this.chatMessages.set(id, message);
    return message;
  }

  async clearChatHistory(userId: string): Promise<boolean> {
    const messages = Array.from(this.chatMessages.entries());
    const deleted = messages.filter(([_, msg]) => msg.userId === userId);
    deleted.forEach(([id, _]) => this.chatMessages.delete(id));
    return deleted.length > 0;
  }
}

export class PostgresStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0];
  }

  async createUser(userInsert: InsertUser): Promise<User> {
    const rows = await db.insert(users).values(userInsert).returning();
    return rows[0];
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const rows = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!rows[0]) {
      throw new Error("User not found");
    }
    return rows[0];
  }

  async getFoodItem(id: string): Promise<FoodItem | undefined> {
    const rows = await db.select().from(foodItems).where(eq(foodItems.id, id)).limit(1);
    return rows[0];
  }

  async getFoodItemByName(name: string): Promise<FoodItem | undefined> {
    const rows = await db.select().from(foodItems).where(eq(foodItems.name, name)).limit(1);
    return rows[0];
  }

  async createFoodItem(itemInsert: InsertFoodItem): Promise<FoodItem> {
    const rows = await db.insert(foodItems).values(itemInsert).returning();
    return rows[0];
  }

  async getAllFoodItems(): Promise<FoodItem[]> {
    const rows = await db.select().from(foodItems);
    return rows;
  }

  async getFoodEntry(id: string): Promise<FoodEntry | undefined> {
    const rows = await db.select().from(foodEntries).where(eq(foodEntries.id, id)).limit(1);
    return rows[0];
  }

  async getFoodEntriesByUser(userId: string): Promise<FoodEntry[]> {
    const rows = await db
      .select()
      .from(foodEntries)
      .where(eq(foodEntries.userId, userId))
      .orderBy(desc(foodEntries.timestamp));
    return rows;
  }

  async createFoodEntry(entryInsert: InsertFoodEntry): Promise<FoodEntry> {
    const rows = await db.insert(foodEntries).values(entryInsert).returning();
    return rows[0];
  }

  async deleteFoodEntry(id: string): Promise<boolean> {
    const rows = await db.delete(foodEntries).where(eq(foodEntries.id, id)).returning({ id: foodEntries.id });
    return !!rows[0];
  }

  // Chat message methods
  async getChatMessagesByUser(userId: string): Promise<ChatMessage[]> {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.userId, userId))
      .orderBy(chatMessages.timestamp);
    return rows;
  }

  async createChatMessage(messageInsert: InsertChatMessage): Promise<ChatMessage> {
    const rows = await db.insert(chatMessages).values(messageInsert).returning();
    return rows[0];
  }

  async clearChatHistory(userId: string): Promise<boolean> {
    const rows = await db.delete(chatMessages).where(eq(chatMessages.userId, userId)).returning({ id: chatMessages.id });
    return rows.length > 0;
  }
}

// Prefer Postgres when DATABASE_URL is provided; fallback to memory otherwise
export const storage: IStorage = process.env.DATABASE_URL ? new PostgresStorage() : new MemStorage();

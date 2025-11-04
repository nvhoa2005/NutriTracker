import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table with profile information
export const users = pgTable("users", {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
    name: text("name").notNull(),
    age: integer("age").notNull(),
    gender: text("gender").notNull(), // male, female, other
    height: real("height").notNull(), // in cm
    weight: real("weight").notNull(), // in kg
    goal: text("goal").notNull(), // lose_weight, maintain, gain_muscle
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Food items database with calorie information per 100g
export const foodItems = pgTable("food_items", {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull().unique(),
    caloriesPer100g: real("calories_per_100g").notNull(),
    advice: text("advice").default("Good for your health."),
});

// Food entries table for calorie tracking
export const foodEntries = pgTable("food_entries", {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    foodName: text("food_name").notNull(),
    calories: integer("calories").notNull(),
    weight: real("weight"), // in grams
    imageUrl: text("image_url"),
    dietComment: text("diet_comment"),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Chat messages table for chatbot conversations
export const chatMessages = pgTable("chat_messages", {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    role: text("role").notNull(), // user or assistant
    content: text("content").notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users, {
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(1, "Name is required"),
    age: z.number().min(1).max(150),
    gender: z.enum(["male", "female", "other"]),
    height: z.number().min(50).max(300), // cm
    weight: z.number().min(20).max(500), // kg
    goal: z.enum(["lose_weight", "maintain", "gain_muscle"]),
}).omit({
    id: true,
    createdAt: true,
});

export const insertFoodItemSchema = createInsertSchema(foodItems, {
    name: z.string().min(1),
    caloriesPer100g: z.number().min(0),
    advice: z.string().optional(),
}).omit({
    id: true,
});

export const insertFoodEntrySchema = createInsertSchema(foodEntries, {
    foodName: z.string().min(1),
    calories: z.number().min(0),
    weight: z.number().min(0).optional(),
    imageUrl: z.string().optional(),
    dietComment: z.string().optional(),
}).omit({
    id: true,
    timestamp: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages, {
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
}).omit({
    id: true,
    timestamp: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertFoodItem = z.infer<typeof insertFoodItemSchema>;
export type FoodItem = typeof foodItems.$inferSelect;
export type InsertFoodEntry = z.infer<typeof insertFoodEntrySchema>;
export type FoodEntry = typeof foodEntries.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Additional types for frontend
export type UserProfile = Omit<User, 'password'> & {
    bmi: number;
    bmiStatus: "underweight" | "normal" | "overweight" | "obese";
};

export type CalorieStats = {
    total: number;
    goal: number;
    remaining: number;
    entries: FoodEntry[];
};

export type MealSuggestion = {
    id: string;
    name: string;
    calories: number;
    imageUrl: string;
    description: string;
};

export type FoodAnalysisResult = {
    foodName: string;
    caloriesPer100g: number;
    weight: number;
    totalCalories: number;
    advice: string;
};

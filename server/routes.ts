import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage-db"; 
import multer from "multer";
import { 
  insertUserSchema, 
  insertFoodEntrySchema, 
  type UserProfile, 
  type CalorieStats, 
  type MealSuggestion, 
  type FoodAnalysisResult 
} from "@shared/schema";
import { 
  analyzeFoodImageByChatGPT, 
  generateFoodAdvice, 
  generatePersonalizedFoodAdvice, 
  generateMealRecipe 
} from "./openai-service";
import { analyzeFoodImageByEfficientnetB1Model } from "./model-service";
import { getChatbotResponse } from "./chatbot";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

// Middleware kiểm tra login
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

// === Helper tính BMI ===
function calculateBMI(weight: number, height: number) {
  const bmi = weight / Math.pow(height / 100, 2);
  let bmiStatus: "underweight" | "normal" | "overweight" | "obese";
  if (bmi < 18.5) bmiStatus = "underweight";
  else if (bmi < 25) bmiStatus = "normal";
  else if (bmi < 30) bmiStatus = "overweight";
  else bmiStatus = "obese";
  return { bmi, bmiStatus };
}

// === Helper tính lượng calo cần ===
function calculateCalorieGoal(user: UserProfile) {
  const base = 10 * user.weight + 6.25 * user.height - 5 * user.age + (user.gender === "male" ? 5 : -161);
  const tdee = base * 1.55;
  if (user.goal === "lose_weight") return Math.round(tdee - 500);
  if (user.goal === "gain_muscle") return Math.round(tdee + 300);
  return Math.round(tdee);
}

// === Helper functions ===
async function estimateCaloriesPerGram(foodName: string): Promise<number> {
  const commonFoods: Record<string, number> = {
    "rice": 130, "chicken": 165, "beef": 250, "pork": 242,
    "fish": 206, "egg": 155, "bread": 265, "apple": 52,
    "banana": 89, "orange": 47, "pasta": 131, "potato": 77,
    "broccoli": 34, "carrot": 41, "tomato": 18, "cheese": 402,
    "milk": 42, "yogurt": 59, "salad": 15, "pizza": 266,
    "burger": 295, "sandwich": 250,
  };

  const lowerFoodName = foodName.toLowerCase();
  for (const [key, calories] of Object.entries(commonFoods)) {
    if (lowerFoodName.includes(key)) return calories;
  }
  return 150;
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // === AUTHENTICATION ===
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByUsername(validatedData.username);
      if (existing) return res.status(400).json({ message: "Username already exists" });

      const user = await storage.createUser({ ...validatedData, password: validatedData.password });

      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ message: "Session creation failed" });
        req.session.userId = user.id;
        const { bmi, bmiStatus } = calculateBMI(user.weight, user.height);
        const { password, ...userWithoutPassword } = user;
        res.json({ ...userWithoutPassword, bmi, bmiStatus });
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ message: "Session creation failed" });
        req.session.userId = user.id;
        const { bmi, bmiStatus } = calculateBMI(user.weight, user.height);
        const { password: _, ...userWithoutPassword } = user;
        res.json({ ...userWithoutPassword, bmi, bmiStatus });
      });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out successfully" });
    });
  });

  // === USER PROFILE ===
  app.get("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { bmi, bmiStatus } = calculateBMI(user.weight, user.height);
      const { password: _, ...userWithoutPassword } = user;
      res.json({ ...userWithoutPassword, bmi, bmiStatus });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.put("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const updates = req.body;
      const updatedUser = await storage.updateUser(userId, updates);
      const { bmi, bmiStatus } = calculateBMI(updatedUser.weight, updatedUser.height);
      const { password, ...userWithoutPassword } = updatedUser;
      res.json({ ...userWithoutPassword, bmi, bmiStatus });
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // === CALORIES & TRACKER ===
  app.get("/api/calories/daily", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { bmi, bmiStatus } = calculateBMI(user.weight, user.height);
      const profile: UserProfile = { ...user, bmi, bmiStatus };
      const goal = calculateCalorieGoal(profile);

      const entries = await storage.getFoodEntriesByUser(req.session.userId!);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayEntries = entries.filter((entry) => {
        const entryDate = new Date(entry.timestamp);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate.getTime() === today.getTime();
      });

      const total = todayEntries.reduce((sum, entry) => sum + entry.calories, 0);
      const remaining = goal - total;

      const stats: CalorieStats = { total, goal, remaining, entries: todayEntries };
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch calorie stats" });
    }
  });

  // API lấy toàn bộ lịch sử cho Tracker
  app.get("/api/calories/entries", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const entries = await storage.getFoodEntriesByUser(userId);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch food entries history" });
    }
  });

  // === FOOD ANALYSIS & ENTRY ===
  
  // 1. Analyze by Model (EfficientNet - Ưu tiên dùng cái này)
  app.post("/api/food/analyzeByModel", requireAuth, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No image uploaded" });

      const weight = req.body.weight ? parseFloat(req.body.weight) : 100;
      const { foodName } = await analyzeFoodImageByEfficientnetB1Model(req.file.buffer);

      let foodItem = await storage.getFoodItemByName(foodName);
      if (!foodItem) {
        const advice = await generateFoodAdvice(foodName);
        const caloriesPer100g = await estimateCaloriesPerGram(foodName);
        foodItem = await storage.createFoodItem({ name: foodName, caloriesPer100g, advice });
      }

      const totalCalories = Math.round((foodItem.caloriesPer100g * weight) / 100);

      const result: FoodAnalysisResult = {
        foodName: foodItem.name,
        caloriesPer100g: foodItem.caloriesPer100g,
        weight,
        totalCalories,
        advice: foodItem.advice || "Good for your health."
      };
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze food: " + error.message });
    }
  });

  // 2. Analyze by ChatGPT (Fallback)
  app.post("/api/food/analyzeByChatGPT", requireAuth, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No image uploaded" });
      const weight = req.body.weight ? parseFloat(req.body.weight) : 100;
      const base64Image = req.file.buffer.toString("base64");
      
      const { foodName } = await analyzeFoodImageByChatGPT(base64Image);

      let foodItem = await storage.getFoodItemByName(foodName);
      if (!foodItem) {
        const advice = await generateFoodAdvice(foodName);
        const caloriesPer100g = await estimateCaloriesPerGram(foodName);
        foodItem = await storage.createFoodItem({ name: foodName, caloriesPer100g, advice });
      }

      const totalCalories = Math.round((foodItem.caloriesPer100g * weight) / 100);
      res.json({
        foodName: foodItem.name,
        caloriesPer100g: foodItem.caloriesPer100g,
        weight,
        totalCalories,
        advice: foodItem.advice || "Good for your health.",
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze food: " + error.message });
    }
  });

  // 3. Review Personalized (Nút Review Food)
  app.post("/api/food/review-personalized", requireAuth, async (req, res) => {
    try {
      const { foodName, calories } = req.body;
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const userProfile = {
        name: user.name, age: user.age, gender: user.gender,
        height: user.height, weight: user.weight, goal: user.goal,
      };

      const advice = await generatePersonalizedFoodAdvice(userProfile, foodName, calories);
      res.json({ advice });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate review" });
    }
  });

  // 4. Add Entry to Database
  app.post("/api/food/entry", requireAuth, async (req, res) => {
    try {
      const validatedData = insertFoodEntrySchema.parse({
        ...req.body,
        userId: req.session.userId,
      });
      const entry = await storage.createFoodEntry(validatedData);
      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Failed to create food entry" });
    }
  });

  // === MEAL SUGGESTIONS & RECIPES ===
  app.get("/api/meals/suggestions", requireAuth, async (_req, res) => {
    res.json([]); // Frontend đã có danh sách mặc định
  });

  // [CACHE STRATEGY] API lấy chi tiết công thức món ăn
  app.post("/api/meals/recipe", requireAuth, async (req, res) => {
    try {
      const { mealName } = req.body;
      if (!mealName) return res.status(400).json({ message: "Meal name is required" });

      // B1: Check Database (Cache Hit)
      const existingRecipe = await storage.getRecipeByName(mealName);
      if (existingRecipe) {
        console.log(`[CACHE HIT] Found recipe for: ${mealName}`);
        return res.json(existingRecipe.data);
      }

      // B2: Call OpenAI (Cache Miss)
      console.log(`[CACHE MISS] Calling OpenAI for: ${mealName}`);
      const recipeData = await generateMealRecipe(mealName);

      // B3: Save to Database
      await storage.createRecipe({ mealName, data: recipeData });

      // B4: Return Result
      res.json(recipeData);
    } catch (error) {
      console.error("Recipe API Error:", error);
      res.status(500).json({ message: "Failed to fetch recipe" });
    }
  });

  // === CHATBOT ===
  app.get("/api/chat/messages", requireAuth, async (req, res) => {
    try {
      const messages = await storage.getChatMessagesByUser(req.session.userId!);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to get chat history" });
    }
  });

  app.post("/api/chat/message", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { content } = req.body;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const userMessage = await storage.createChatMessage({ userId, role: "user", content });
      
      // Lấy full history để gửi kèm cho bot nhớ ngữ cảnh
      const chatHistory = await storage.getChatMessagesByUser(userId);
      const botResponse = await getChatbotResponse(content, user, chatHistory);

      const assistantMessage = await storage.createChatMessage({ userId, role: "assistant", content: botResponse });

      res.json({ userMessage, assistantMessage });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to process chat message" });
    }
  });

  app.delete("/api/chat/history", requireAuth, async (req, res) => {
    try {
      await storage.clearChatHistory(req.session.userId!);
      res.json({ message: "Chat history cleared" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear chat history" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
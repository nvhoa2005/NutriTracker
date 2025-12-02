import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage-db";
import multer from "multer";
import { insertUserSchema, insertFoodEntrySchema, insertFoodItemSchema, insertChatMessageSchema, type UserProfile, type CalorieStats, type MealSuggestion, type FoodAnalysisResult } from "@shared/schema";
import { analyzeFoodImageByChatGPT, generateFoodAdvice, generatePersonalizedFoodAdvice } from "./openai-service";
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
    "rice": 130,
    "chicken": 165,
    "beef": 250,
    "pork": 242,
    "fish": 206,
    "egg": 155,
    "bread": 265,
    "apple": 52,
    "banana": 89,
    "orange": 47,
    "pasta": 131,
    "potato": 77,
    "broccoli": 34,
    "carrot": 41,
    "tomato": 18,
    "cheese": 402,
    "milk": 42,
    "yogurt": 59,
    "salad": 15,
    "pizza": 266,
    "burger": 295,
    "sandwich": 250,
  };

  const lowerFoodName = foodName.toLowerCase();
  for (const [key, calories] of Object.entries(commonFoods)) {
    if (lowerFoodName.includes(key)) {
      return calories;
    }
  }

  return 150;
}

// === API CHÍNH ===
export async function registerRoutes(app: Express): Promise<Server> {
  // Đăng ký tài khoản
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);

      const existing = await storage.getUserByUsername(validatedData.username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Hash password before storing
      const user = await storage.createUser({
      ...validatedData,
      password: validatedData.password,
      });

      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ message: "Session creation failed" });

        req.session.userId = user.id;

        const { bmi, bmiStatus } = calculateBMI(user.weight, user.height);
        const { password, ...userWithoutPassword } = user;
        const profile: UserProfile = { ...userWithoutPassword, bmi, bmiStatus };
        res.json(profile);
      });
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Đăng nhập
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Missing credentials" });

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Compare hashed password
      if (user.password !== password) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ message: "Session creation failed" });

        req.session.userId = user.id;

        const { bmi, bmiStatus } = calculateBMI(user.weight, user.height);
        const { password: _, ...userWithoutPassword } = user;
        const profile: UserProfile = { ...userWithoutPassword, bmi, bmiStatus };
        res.json(profile);
      });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Đăng xuất
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get user profile
  app.get("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { bmi, bmiStatus } = calculateBMI(user.weight, user.height);
      const { password: _, ...userWithoutPassword } = user;
      const profile: UserProfile = { ...userWithoutPassword, bmi, bmiStatus };
      res.json(profile);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Update user profile
  app.put("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const updates = req.body;

      // Chỉ cho phép cập nhật một số trường nhất định
      const allowedFields = ["name", "age", "gender", "height", "weight", "goal"];
      const filteredUpdates: any = {};
      for (const key of allowedFields) {
        if (updates[key] !== undefined) {
          filteredUpdates[key] = updates[key];
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updatedUser = await storage.updateUser(userId, filteredUpdates);

      const { bmi, bmiStatus } = calculateBMI(updatedUser.weight, updatedUser.height);
      const { password, ...userWithoutPassword } = updatedUser;
      const profile: UserProfile = { ...userWithoutPassword, bmi, bmiStatus };

      res.json(profile);
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });


  // Get daily calorie stats
  app.get("/api/calories/daily", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

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

      const stats: CalorieStats = {
        total,
        goal,
        remaining,
        entries: todayEntries,
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch calorie stats" });
    }
  });

  // API lấy toàn bộ lịch sử ăn uống cho trang Tracker
  app.get("/api/calories/entries", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const entries = await storage.getFoodEntriesByUser(userId);
      
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch food entries history" });
    }
  });

  // Analyze food image
  app.post("/api/food/analyzeByChatGPT", requireAuth, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const weight = req.body.weight ? parseFloat(req.body.weight) : 100;
      if (isNaN(weight) || weight <= 0) {
        return res.status(400).json({ message: "Weight must be a valid number greater than 0" });
      }

      const base64Image = req.file.buffer.toString("base64");
      const { foodName } = await analyzeFoodImageByChatGPT(base64Image);

      let foodItem = await storage.getFoodItemByName(foodName);
      if (!foodItem) {
        const advice = await generateFoodAdvice(foodName);
        const caloriesPer100g = await estimateCaloriesPerGram(foodName);
        
        foodItem = await storage.createFoodItem({
          name: foodName,
          caloriesPer100g,
          advice,
        });
      }

      const totalCalories = Math.round((foodItem.caloriesPer100g * weight) / 100);

      const result: FoodAnalysisResult = {
        foodName: foodItem.name,
        caloriesPer100g: foodItem.caloriesPer100g,
        weight,
        totalCalories,
        advice: foodItem.advice || "Good for your health.",
      };

      res.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: "Failed to analyze food: " + errorMessage });
    }
  });

  app.post("/api/food/analyzeByModel", requireAuth, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const weight = req.body.weight ? parseFloat(req.body.weight) : 100;
      if (isNaN(weight) || weight <= 0) {
        return res.status(400).json({ message: "Weight must be a valid number greater than 0" });
      }

      // 1. Dùng req.file.buffer trực tiếp, không cần base64
      const imageBuffer = req.file.buffer;

      // 2. Gọi hàm analyze mới của chúng ta
      const { foodName, confidence } = await analyzeFoodImageByEfficientnetB1Model(imageBuffer);

      let foodItem = await storage.getFoodItemByName(foodName);
      if (!foodItem) {
        // (Giả định bạn đã định nghĩa các hàm này ở nơi khác)
        const advice = await generateFoodAdvice(foodName);
        const caloriesPer100g = await estimateCaloriesPerGram(foodName);
        
        foodItem = await storage.createFoodItem({
          name: foodName,
          caloriesPer100g,
          advice,
        });
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: "Failed to analyze food: " + errorMessage });
    }
  });

  // Get food item advice
  app.get("/api/food/:name/advice", requireAuth, async (req, res) => {
    try {
      const foodName = decodeURIComponent(req.params.name);
      let foodItem = await storage.getFoodItemByName(foodName);

      if (!foodItem) {
        const advice = await generateFoodAdvice(foodName);
        return res.json({ advice });
      }

      res.json({ advice: foodItem.advice || "Good for your health." });
    } catch (error) {
      res.status(500).json({ message: "Failed to get food advice" });
    }
  });

  // Create food entry
  app.post("/api/food/entry", requireAuth, async (req, res) => {
    try {
      const validatedData = insertFoodEntrySchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      const entry = await storage.createFoodEntry(validatedData);
      res.json(entry);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Failed to create food entry" });
    }
  });

  // Get meal suggestions
  app.get("/api/meals/suggestions", requireAuth, async (_req, res) => {
    const suggestions: MealSuggestion[] = [];
    res.json(suggestions);
  });

  // === CHATBOT ROUTES ===
  
  // Get chat history
  app.get("/api/chat/messages", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const messages = await storage.getChatMessagesByUser(userId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to get chat history" });
    }
  });

  // Send a message and get chatbot response
  app.post("/api/chat/message", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { content } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Message content is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userMessage = await storage.createChatMessage({
        userId,
        role: "user",
        content,
      });

      const chatHistory = await storage.getChatMessagesByUser(userId);
      
      const botResponse = await getChatbotResponse(content, user, chatHistory);

      const assistantMessage = await storage.createChatMessage({
        userId,
        role: "assistant",
        content: botResponse,
      });

      res.json({
        userMessage,
        assistantMessage,
      });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ message: error.message || "Failed to process chat message" });
    }
  });

  // API mới cho việc Review cá nhân hóa
  app.post("/api/food/review-personalized", requireAuth, async (req, res) => {
    try {
      const { foodName, calories } = req.body;
      const userId = req.session.userId!;

      // 1. Lấy thông tin User từ DB
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // 2. Chuẩn bị context
      const userProfile = {
        name: user.name,
        age: user.age,
        gender: user.gender,
        height: user.height,
        weight: user.weight,
        goal: user.goal,
      };

      // 3. Gọi OpenAI với thông tin User + Món ăn
      const advice = await generatePersonalizedFoodAdvice(userProfile, foodName, calories);

      // 4. Trả về kết quả
      res.json({ advice });

    } catch (error) {
      console.error("Review error:", error);
      res.status(500).json({ message: "Failed to generate review" });
    }
  });

  // Clear chat history
  app.delete("/api/chat/history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await storage.clearChatHistory(userId);
      res.json({ message: "Chat history cleared" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear chat history" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}


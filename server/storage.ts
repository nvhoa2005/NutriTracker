import type { 
  User, InsertUser, 
  FoodEntry, InsertFoodEntry, 
  FoodItem, InsertFoodItem, 
  ChatMessage, InsertChatMessage, 
  Recipe, InsertRecipe 
} from "@shared/schema";

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

  // Recipe methods
  getRecipeByName(mealName: string): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
}
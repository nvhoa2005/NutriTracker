import OpenAI from "openai";
import fs from "fs";
import path from "path";

// Referenced from blueprint:javascript_openai
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user

let openai: OpenAI | null = null;

interface UserProfileContext {
  name: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
  goal: string;
}

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export async function analyzeFoodImageByChatGPT(base64Image: string): Promise<{ foodName: string; confidence: number }> {
  try {
    const classesPath = path.resolve("./classes.txt");
    const allowedFoods = fs.readFileSync(classesPath, "utf-8").split("\n").map(s => s.trim()).filter(Boolean);

    const allowedList = allowedFoods.join(", ");

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a food recognition expert. You must identify the food item ONLY from the following list of allowed foods: ${allowedList}. 
Respond strictly with JSON in this format: { "foodName": string, "confidence": number }. 
If the food is not clearly one of these 100 classes, choose the closest one.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Identify which food this image shows, using only one label from the allowed list.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 300,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      foodName: result.foodName || "Unknown Food",
      confidence: Math.max(0, Math.min(1, result.confidence || 0.8)),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error("Failed to analyze food image: " + errorMessage);
  }
}

export async function generateFoodAdvice(foodName: string): Promise<string> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a nutrition expert. Provide brief, helpful advice about the food item.",
        },
        {
          role: "user",
          content: `Provide a brief piece of nutritional advice or health benefit for ${foodName}.`,
        },
      ],
      max_completion_tokens: 200,
    });

    return response.choices[0].message.content || "Good for your health.";
  } catch (error) {
    return "Good for your health.";
  }
}

export async function generatePersonalizedFoodAdvice(
  userProfile: UserProfileContext,
  foodName: string,
  calories: number
): Promise<string> {
  try {
    const client = getOpenAIClient();
    
    // Xây dựng prompt chi tiết
    const prompt = `
    You are a professional nutritionist. Provide a personalized review of a food item for a specific user.
    
    User Profile:
    - Name: ${userProfile.name}
    - Age: ${userProfile.age}
    - Gender: ${userProfile.gender}
    - Height: ${userProfile.height}cm
    - Weight: ${userProfile.weight}kg
    - Fitness Goal: ${userProfile.goal} (lose_weight/maintain/gain_muscle)

    Food Item:
    - Name: ${foodName}
    - Estimated Calories: ${calories} kcal

    Please analyze this food item in the context of the user's goals and stats. 
    Is it a good choice for them? What should they be careful about? 
    Keep the advice encouraging but realistic. Limit to 3-4 sentences.
    `;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful nutrition assistant.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 300,
    });

    return response.choices[0].message.content || "Could not generate advice at this time.";
  } catch (error) {
    console.error("OpenAI Error:", error);
    throw new Error("Failed to generate personalized advice");
  }
}
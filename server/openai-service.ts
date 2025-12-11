import OpenAI from "openai";
import fs from "fs";
import path from "path";

let openai: OpenAI | null = null;

export interface UserProfileContext {
  name: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
  goal: string;
}

export interface FoodDetailData {
  calories_100g: number;
  avg_price: string;       
  health_benefit: string;  
  personalized_advice: string; 
  suggestions: string[];   
  macros: {
    protein: string;
    carbs: string;
    fat: string;
  };
}

export interface RecipeData extends FoodDetailData {} 

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export async function generateMealRecipe(
  mealName: string, 
  userProfile?: UserProfileContext 
): Promise<FoodDetailData> {
  try {
    const client = getOpenAIClient();
    
    let userContextStr = "";
    if (userProfile) {
      userContextStr = `
      Target User Context:
      - Goal: ${userProfile.goal} (lose_weight/maintain/gain_muscle)
      - Info: ${userProfile.age} years old, ${userProfile.gender}.
      `;
    }

    const prompt = `
      Analyze the food item: "${mealName}".
      ${userContextStr}

      Return ONLY a valid JSON object with the following structure. Do not include markdown formatting.
      {
        "calories_100g": number (approximate calories per 100g),
        "avg_price": "string" (estimated price range in USD, e.g., '$3 - $5'),
        "health_benefit": "string" (1-2 sentences on general health benefits of this food),
        "personalized_advice": "string" (Specific advice based on the user's goal. E.g., if gaining muscle, mention protein. If losing weight, mention portion control),
        "suggestions": ["string", "string", "string"] (3 food items that pair well with this to create a balanced meal for the user's goal),
        "macros": {
          "protein": "string" (e.g., '10g'),
          "carbs": "string" (e.g., '20g'),
          "fat": "string" (e.g., '5g')
        }
      }
    `;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional nutritionist and food market expert." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "{}";
    return JSON.parse(content) as FoodDetailData;

  } catch (error) {
    console.error("Food Detail generation error:", error);
    return {
      calories_100g: 0,
      avg_price: "N/A",
      health_benefit: "Information currently unavailable.",
      personalized_advice: "Please consult a nutritionist.",
      suggestions: [],
      macros: { protein: "0g", carbs: "0g", fat: "0g" }
    };
  }
}


export async function analyzeFoodImageByChatGPT(base64Image: string): Promise<{ foodName: string; confidence: number }> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Identify the food item in this image. Return JSON: { \"foodName\": string, \"confidence\": number }",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What food is this?" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      foodName: result.foodName || "Unknown Food",
      confidence: result.confidence || 0.8,
    };
  } catch (error) {
    console.error("Analyze Error:", error);
    return { foodName: "Unknown", confidence: 0 };
  }
}

export async function generateFoodAdvice(foodName: string): Promise<string> {
  return `Enjoy ${foodName} as part of a balanced diet.`;
}

export async function generatePersonalizedFoodAdvice(
  userProfile: UserProfileContext,
  foodName: string,
  calories: number
): Promise<string> {
  try {
    const client = getOpenAIClient();
    const prompt = `
    User Goal: ${userProfile.goal}. Food: ${foodName} (${calories} kcal).
    Give some sentences of advice.
    `;
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 200,
    });
    return response.choices[0].message.content || "Eat moderately.";
  } catch {
    return "Eat moderately.";
  }
}
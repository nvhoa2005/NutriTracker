import OpenAI from "openai";
import type { User, ChatMessage } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface UserContext {
  name: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
  goal: string;
  bmi: number;
}

function calculateBMI(height: number, weight: number): number {
  const heightInMeters = height / 100;
  return parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(1));
}

function getUserContext(user: User): UserContext {
  const bmi = calculateBMI(user.height, user.weight);
  
  return {
    name: user.name,
    age: user.age,
    gender: user.gender,
    height: user.height,
    weight: user.weight,
    goal: user.goal,
    bmi,
  };
}

function createSystemPrompt(userContext: UserContext): string {
  const goalText = 
    userContext.goal === "lose_weight" ? "lose weight" :
    userContext.goal === "gain_muscle" ? "gain muscle" :
    "maintain their current weight";

  return `You are a friendly and knowledgeable health and nutrition assistant for CalorieTrack, a calorie tracking application. 

You are chatting with ${userContext.name}, who has the following profile:
- Age: ${userContext.age} years old
- Gender: ${userContext.gender}
- Height: ${userContext.height} cm
- Weight: ${userContext.weight} kg
- BMI: ${userContext.bmi}
- Fitness Goal: ${goalText}

Your role is to:
1. Provide personalized health, nutrition, and fitness advice based on their specific profile
2. Answer questions about calories, diet, exercise, and wellness
3. Be supportive, encouraging, and motivational
4. Use their name occasionally to make the conversation feel personal
5. Give practical, actionable advice that aligns with their fitness goal
6. Be conversational and natural, not overly formal

Remember:
- Always consider their specific metrics (age, weight, height, BMI, goal) when giving advice
- Provide realistic and safe recommendations
- Encourage healthy habits
- Be positive and supportive

Keep your responses concise and friendly, typically 2-4 sentences unless more detail is specifically requested.`;
}

export async function getChatbotResponse(
  userMessage: string,
  user: User,
  chatHistory: ChatMessage[]
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const userContext = getUserContext(user);
  const systemPrompt = createSystemPrompt(userContext);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  chatHistory.slice(-10).forEach((msg) => {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  });

  messages.push({
    role: "user",
    content: userMessage,
  });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 500,
    });

    return response.choices[0].message.content || "I'm sorry, I couldn't generate a response.";
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    throw new Error(`Failed to get chatbot response: ${error.message}`);
  }
}

import fetch from 'node-fetch';
import FormData from 'form-data';

const MODEL_API_URL = "http://127.0.0.1:8000/predict";

interface YoloResponse {
  type: "image" | "video";
  detections: Array<{
    class: string;
    confidence: number;
    box_ratio: number;
  }>;
  count: number;
  annotated_data: string;
  depth_data?: string; 
}

const CALORIE_DB: Record<string, number> = {
  "apple": 52, "banana": 89, "orange": 47, "broccoli": 34, "carrot": 41,
  "pizza": 266, "hot dog": 290, "hamburger": 295, "sandwich": 250,
  "donut": 452, "cake": 371, "bowl": 130,
  "cup": 50, "bottle": 0, "person": 0, "default": 150
};

function estimateWeightFromVolume(volumeScore: number): number {
  const DENSITY_FACTOR = 35.0; 
  
  let weight = volumeScore * DENSITY_FACTOR;
  
  if (weight < 20) weight = 20;    
  if (weight > 1200) weight = 1200; 
  
  return Math.round(weight);
}

export async function analyzeFoodImageByYOLO(
  fileBuffer: Buffer,
  mimeType: string,
  useAutoWeight: boolean,
  totalManualWeight: number = 0
): Promise<{ 
  foodName: string; 
  confidence: number; 
  detections: Array<{ 
    class: string; 
    confidence: number; 
    box_ratio: number;
    estimated_weight: number;
    estimated_calories: number;
  }>;
  annotatedData: string;
  depthData?: string;
  type: "image" | "video";
  totalCalories: number;
  totalWeight: number;
}> {
  try {
    const form = new FormData();
    const filename = mimeType.startsWith('video') ? 'video.mp4' : 'image.jpg';
    form.append("file", fileBuffer, { filename, contentType: mimeType });

    const response = await fetch(MODEL_API_URL, { method: "POST", body: form });

    if (!response.ok) {
      throw new Error(`API model error: ${await response.text()}`);
    }

    const result = (await response.json()) as YoloResponse;

    let processedDetections = [];
    let totalMealCalories = 0;
    let totalMealWeight = 0;
    let maxConfidence = 0;

    const validDetections = result.detections.filter(d => d.class !== 'person');
    
    const totalVolumeScore = validDetections.reduce((sum, det) => sum + det.box_ratio, 0);

    for (const det of validDetections) {
      const calPer100g = CALORIE_DB[det.class] || CALORIE_DB["default"];
      let weight = 0;

      if (useAutoWeight) {
        weight = estimateWeightFromVolume(det.box_ratio);
      } else {
        if (totalVolumeScore > 0) {
          weight = (det.box_ratio / totalVolumeScore) * totalManualWeight;
        }
      }
      
      weight = Math.round(weight);
      const calories = Math.round((weight * calPer100g) / 100);
      
      totalMealCalories += calories;
      totalMealWeight += weight;

      processedDetections.push({
        ...det,
        estimated_weight: weight,
        estimated_calories: calories
      });

      if (det.confidence > maxConfidence) {
        maxConfidence = det.confidence;
      }
    }

    let mainFoodName = "Unknown Food";

    if (processedDetections.length === 0) {
      mainFoodName = "No Food Detected";
    } else {
      const allNames = processedDetections.map(d => d.class);
      const uniqueNames = Array.from(new Set(allNames));
      mainFoodName = uniqueNames.join(", ");
    }

    return {
      foodName: mainFoodName,
      confidence: maxConfidence,
      detections: processedDetections,
      annotatedData: result.annotated_data,
      depthData: result.depth_data, 
      type: result.type,
      totalCalories: totalMealCalories,
      totalWeight: totalMealWeight
    };

  } catch (error) {
    throw new Error("Analysis failed: " + (error instanceof Error ? error.message : "Unknown error"));
  }
}
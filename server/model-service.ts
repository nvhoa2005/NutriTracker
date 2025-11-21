import fetch from 'node-fetch';
import FormData from 'form-data';

// Địa chỉ server FastAPI của bạn
const EFFICIENTNET_API_URL = "http://127.0.0.1:8000/predict";

/**
 * Phân tích ảnh món ăn bằng model EfficientNet-B1 (API Python).
 * Đầu vào là Buffer ảnh thô (từ req.file.buffer).
 * Đầu ra giống hệt hàm analyzeFoodImageByChatGPT.
 */
export async function analyzeFoodImageByEfficientnetB1Model(
  imageBuffer: Buffer
): Promise<{ foodName: string; confidence: number }> {
  try {
    // 1. Tạo FormData để gửi file
    const form = new FormData();
    // 'file' phải khớp với tên tham số (File(...)) trên server FastAPI
    // Cung cấp một tên file giả, ví dụ 'image.jpg', vì Buffer không có tên
    form.append("file", imageBuffer, "image.jpg");

    // 2. Gọi API Python
    const response = await fetch(EFFICIENTNET_API_URL, {
      method: "POST",
      body: form,
      // Headers (Content-Type) sẽ được 'form-data' tự động thêm vào
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API model trả về lỗi ${response.status}: ${errorText}`);
    }

    // 3. Phân tích kết quả JSON
    const result: {
      predicted_class: string;
      confidence: string; // API của chúng ta trả về string, cần convert
      all_probabilities: Record<string, number>;
    } = (await response.json()) as any;

    // 4. Trả về kết quả theo định dạng chuẩn
    return {
      foodName: result.predicted_class,
      confidence: parseFloat(result.confidence) || 0.9, // Chuyển "0.9876" thành 0.9876
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // Ném lỗi để endpoint API có thể bắt được
    throw new Error("Failed to analyze food image with EfficientNet: " + errorMessage);
  }
}
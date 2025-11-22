import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data'; // Đã sửa import (không có * as)
import { fileURLToPath } from 'url';

// --- Sửa lỗi __dirname trong ES Module ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- Hết phần sửa lỗi ---

// --- CẤU HÌNH ---
const API_URL = 'http://127.0.0.1:8000/predict';

// Đường dẫn này là tương đối so với file test_model_host.ts
const IMAGE_PATH = path.join(__dirname, 'image', 'hinh-anh-bat-mat-1024x682.jpg'); 
// --- KẾT THÚC CẤU HÌNH ---

/**
 * Hàm test API
 */
async function testPrediction() {
    console.log(`Đang đọc ảnh từ: ${IMAGE_PATH}`);
    
    if (!fs.existsSync(IMAGE_PATH)) {
        console.error(`LỖI: Không tìm thấy file ảnh tại: ${IMAGE_PATH}`);
        return;
    }

    // Tạo FormData
    const form = new FormData();
    form.append('file', fs.createReadStream(IMAGE_PATH));

    console.log('Đang gửi yêu cầu đến API...');

    try {
        // Gửi yêu cầu POST
        const response = await fetch(API_URL, {
            method: 'POST',
            body: form,
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('API trả về lỗi:', data);
        } else {
            console.log('--- KẾT QUẢ DỰ ĐOÁN ---');
            console.log(JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.error('Lỗi khi gọi API:', error.message);
    }
}

// Chạy hàm test
testPrediction();

// npx tsx test_model_host.ts
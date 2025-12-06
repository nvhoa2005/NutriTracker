import io
import base64
import cv2
import numpy as np
import tempfile
import os
import torch
from fastapi import FastAPI, UploadFile, File, HTTPException
from contextlib import asynccontextmanager
from PIL import Image
from ultralytics import YOLO
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

# --- CẤU HÌNH ---
YOLO_MODEL_PATH = "yolov8n-seg.pt" 
# Sử dụng Depth Anything V2 bản Small (nhanh & chính xác)
DEPTH_MODEL_REPO = "depth-anything/Depth-Anything-V2-Small-hf"

app_models = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("⏳ Đang tải các Model AI (YOLOv8 + Depth Anything V2)...")
    try:
        # 1. Load YOLO (Segmentation)
        app_models["yolo"] = YOLO(YOLO_MODEL_PATH)
        print("✅ YOLOv8 Loaded.")

        # 2. Load Depth Anything V2 (Thay thế MiDaS)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        image_processor = AutoImageProcessor.from_pretrained(DEPTH_MODEL_REPO)
        depth_model = AutoModelForDepthEstimation.from_pretrained(DEPTH_MODEL_REPO).to(device)
        depth_model.eval()

        app_models["depth_processor"] = image_processor
        app_models["depth_model"] = depth_model
        app_models["device"] = device
        
        print("✅ Depth Anything V2 Loaded.")
    except Exception as e:
        print(f"❌ Lỗi tải model: {e}")
    yield
    app_models.clear()

app = FastAPI(lifespan=lifespan)

def get_depth_map(img_cv2):
    """Sử dụng Depth Anything V2 để tạo bản đồ độ sâu"""
    if "depth_model" not in app_models: return None, None

    processor = app_models["depth_processor"]
    model = app_models["depth_model"]
    device = app_models["device"]

    # Chuyển đổi ảnh sang RGB (Hugging Face processor nhận PIL hoặc Numpy RGB)
    img_rgb = cv2.cvtColor(img_cv2, cv2.COLOR_BGR2RGB)
    
    # Pre-process ảnh
    inputs = processor(images=img_rgb, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = model(**inputs)
        predicted_depth = outputs.predicted_depth

    # Nội suy (Resize) bản đồ độ sâu về kích thước gốc của ảnh
    h, w = img_cv2.shape[:2]
    prediction = torch.nn.functional.interpolate(
        predicted_depth.unsqueeze(1),
        size=(h, w),
        mode="bicubic",
        align_corners=False,
    ).squeeze()

    depth_map = prediction.cpu().numpy()

    # [VISUALIZATION] Tạo ảnh Heatmap đẹp hơn (Magma colormap nhìn rất nghệ thuật)
    depth_min = depth_map.min()
    depth_max = depth_map.max()
    # Chuẩn hóa về 0-255
    depth_normalized = (depth_map - depth_min) / (depth_max - depth_min)
    depth_uint8 = (depth_normalized * 255).astype(np.uint8)
    
    # Dùng colormap MAGMA hoặc INFERNO (tốt cho hiển thị độ sâu)
    depth_colormap = cv2.applyColorMap(depth_uint8, cv2.COLORMAP_MAGMA)
    
    _, buffer = cv2.imencode(".jpg", depth_colormap)
    depth_base64 = base64.b64encode(buffer).decode("utf-8")

    return depth_map, f"data:image/jpeg;base64,{depth_base64}"

def calculate_volume(mask_polygon, depth_map, img_shape):
    if depth_map is None: return 0
    
    mask = np.zeros(img_shape[:2], dtype=np.uint8)
    h, w = img_shape[:2]
    
    # Vẽ mask món ăn lên nền đen
    if len(mask_polygon) > 0:
        # Chuyển tọa độ chuẩn hóa về pixel
        poly_pixels = (mask_polygon.reshape(-1, 2) * [w, h]).astype(np.int32)
        cv2.fillPoly(mask, [poly_pixels], 1)

    # Lấy độ sâu tại vùng có món ăn
    object_depth_values = depth_map[mask > 0]
    if len(object_depth_values) == 0: return 0

    # Tính độ sâu trung bình tương đối
    avg_depth = np.mean(object_depth_values)
    area_pixels = np.sum(mask)
    
    # [CÔNG THỨC MỚI] Depth Anything trả về giá trị khác scale với MiDaS
    # Ta cần chia cho một hằng số khác để ra Volume Score hợp lý (khoảng 1-100)
    volume_score = (area_pixels * avg_depth) / 50000.0 
    
    return float(round(volume_score, 2))

def process_image(model, image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img_h, img_w = img.shape[:2]
    
    # 1. Chạy Depth Anything V2 trước
    depth_map, depth_image_base64 = get_depth_map(img)

    # 2. Chạy YOLOv8
    results = model.predict(img, conf=0.25)
    result = results[0]
    
    detections = []
    
    if result.masks:
        for i, box in enumerate(result.boxes):
            class_id = int(box.cls[0])
            class_name = model.names[class_id]
            confidence = float(box.conf[0].item())
            
            # Lấy mask polygon
            segments = result.masks.xyn[i]
            
            # Tính volume score
            volume_score = 0
            if len(segments) > 0:
                volume_score = calculate_volume(segments, depth_map, img.shape)
            
            # Fallback
            if volume_score == 0:
                w, h = box.xywh[0][2].item(), box.xywh[0][3].item()
                volume_score = ((w * h) / (img_h * img_w)) * 10

            detections.append({
                "class": class_name, 
                "confidence": round(confidence, 2),
                "box_ratio": volume_score
            })
    
    # Vẽ kết quả YOLO
    res_plotted = result.plot(boxes=False) 
    _, buffer = cv2.imencode(".jpg", res_plotted)
    base64_image = base64.b64encode(buffer).decode("utf-8")
    
    return {
        "type": "image",
        "detections": detections,
        "count": len(detections),
        "annotated_data": f"data:image/jpeg;base64,{base64_image}",
        "depth_data": depth_image_base64
    }

# (Giữ nguyên phần Video và API predict như cũ, chúng sẽ tự dùng hàm get_depth_map mới)
# ... [Phần code process_video và @app.post giữ nguyên như file cũ] ...

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    model = app_models.get("yolo")
    if not model: raise HTTPException(status_code=503, detail="Model Loading...")
    
    content_type = file.content_type
    if content_type.startswith("image/"):
        contents = await file.read()
        return process_image(model, contents)
    elif content_type.startswith("video/"):
        # Nếu bạn muốn mở lại video sau này thì uncomment, hiện tại tập trung test ảnh Depth
        # return process_video(model, temp_path...)
        raise HTTPException(status_code=400, detail="Vui lòng test Ảnh để trải nghiệm Depth Anything V2.")
    else:
        raise HTTPException(status_code=400, detail="File error.")


# Chạy: python -m uvicorn host_model:app --reload --host 0.0.0.0 --port 8000

import shutil
import base64
import cv2
import numpy as np
import tempfile
import os
import torch
from fastapi import FastAPI, UploadFile, File, HTTPException
from contextlib import asynccontextmanager
from ultralytics import YOLO
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

YOLO_MODEL_PATH = "yolov8n-seg.pt" 
DEPTH_MODEL_REPO = "depth-anything/Depth-Anything-V2-Small-hf"

TARGET_FOOD_CLASSES = [
    "banana", "apple", "sandwich", "orange", "broccoli", "carrot", 
    "hot dog", "pizza", "donut", "cake"
]

app_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Đang tải và cấu hình Vision Agent...")
    try:
        model = YOLO(YOLO_MODEL_PATH)
        app_state["yolo"] = model
        
        target_ids = []
        for id, name in model.names.items():
            if name in TARGET_FOOD_CLASSES:
                target_ids.append(id)
        
        app_state["food_ids"] = target_ids
        print(f"Đã cấu hình bộ lọc cho {len(target_ids)} loại thực phẩm/dụng cụ ăn.")

        device = "cuda" if torch.cuda.is_available() else "cpu"
        image_processor = AutoImageProcessor.from_pretrained(DEPTH_MODEL_REPO)
        depth_model = AutoModelForDepthEstimation.from_pretrained(DEPTH_MODEL_REPO).to(device)
        depth_model.eval()

        app_state["depth_processor"] = image_processor
        app_state["depth_model"] = depth_model
        app_state["device"] = device
        
        print("Depth Anything V2 Loaded.")
    except Exception as e:
        print(f"Lỗi khởi động: {e}")
    yield
    app_state.clear()

app = FastAPI(lifespan=lifespan)

def get_depth_map(img_cv2):
    if "depth_model" not in app_state: return None, None
    
    processor = app_state["depth_processor"]
    model = app_state["depth_model"]
    device = app_state["device"]

    img_rgb = cv2.cvtColor(img_cv2, cv2.COLOR_BGR2RGB)
    inputs = processor(images=img_rgb, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = model(**inputs)
        predicted_depth = outputs.predicted_depth

    h, w = img_cv2.shape[:2]
    prediction = torch.nn.functional.interpolate(
        predicted_depth.unsqueeze(1),
        size=(h, w),
        mode="bicubic",
        align_corners=False,
    ).squeeze()

    depth_map = prediction.cpu().numpy()
    
    depth_min = depth_map.min()
    depth_max = depth_map.max()
    depth_normalized = (depth_map - depth_min) / (depth_max - depth_min)
    depth_uint8 = (depth_normalized * 255).astype(np.uint8)
    depth_colormap = cv2.applyColorMap(depth_uint8, cv2.COLORMAP_MAGMA)
    _, buffer = cv2.imencode(".jpg", depth_colormap)
    depth_base64 = base64.b64encode(buffer).decode("utf-8")

    return depth_map, f"data:image/jpeg;base64,{depth_base64}"

def calculate_volume(mask_polygon, depth_map, img_shape):
    if depth_map is None: return 0
    mask = np.zeros(img_shape[:2], dtype=np.uint8)
    h, w = img_shape[:2]
    if len(mask_polygon) > 0:
        poly_pixels = (mask_polygon.reshape(-1, 2) * [w, h]).astype(np.int32)
        cv2.fillPoly(mask, [poly_pixels], 1)

    object_depth_values = depth_map[mask > 0]
    if len(object_depth_values) == 0: return 0

    avg_depth = np.mean(object_depth_values)
    area_pixels = np.sum(mask)
    volume_score = (area_pixels * avg_depth) / 50000.0 
    return float(round(volume_score, 2))

def process_image(model, image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img_h, img_w = img.shape[:2]
    
    depth_map, depth_image_base64 = get_depth_map(img)
    food_ids = app_state.get("food_ids", None)

    results = model.predict(img, conf=0.25, classes=food_ids)
    result = results[0]
    
    detections = []
    if result.masks:
        for i, box in enumerate(result.boxes):
            class_id = int(box.cls[0])
            class_name = model.names[class_id]
            confidence = float(box.conf[0].item())
            segments = result.masks.xyn[i]
            
            volume_score = 0
            if len(segments) > 0:
                volume_score = calculate_volume(segments, depth_map, img.shape)
            if volume_score == 0: 
                w, h = box.xywh[0][2].item(), box.xywh[0][3].item()
                volume_score = ((w * h) / (img_h * img_w)) * 10

            detections.append({
                "class": class_name, 
                "confidence": round(confidence, 2),
                "box_ratio": volume_score
            })
    
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

def process_video(model, video_path):
    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    
    temp_out = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
    out_path = temp_out.name
    temp_out.close()
    
    try:
        fourcc = cv2.VideoWriter_fourcc(*'avc1')
        out = cv2.VideoWriter(out_path, fourcc, fps, (width, height))
    except:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(out_path, fourcc, fps, (width, height))
    
    object_volumes = {} 
    frame_count = 0
    food_ids = app_state.get("food_ids", None)
    
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            
            results = model.predict(frame, conf=0.25, verbose=False, classes=food_ids)
            result = results[0]
            
            if frame_count % 15 == 0: 
                depth_map, _ = get_depth_map(frame)
                if result.masks:
                    for i, box in enumerate(result.boxes):
                        class_id = int(box.cls[0])
                        cls_name = model.names[class_id]
                        segments = result.masks.xyn[i]
                        
                        if len(segments) > 0:
                            vol = calculate_volume(segments, depth_map, frame.shape)
                            if cls_name not in object_volumes:
                                object_volumes[cls_name] = []
                            object_volumes[cls_name].append(vol)
            
            res_plotted = result.plot(boxes=False)
            out.write(res_plotted)
            frame_count += 1
            
    except Exception as e:
        print(f"Lỗi xử lý video: {e}")
    finally:
        cap.release()
        out.release()
    
    final_detections = []
    for name, volumes in object_volumes.items():
        if len(volumes) > 0:
            avg_volume = sum(volumes) / len(volumes)
            final_detections.append({
                "class": name,
                "confidence": 0.9, 
                "box_ratio": round(avg_volume, 2)
            })

    try:
        with open(out_path, "rb") as f:
            video_bytes = f.read()
        base64_video = base64.b64encode(video_bytes).decode("utf-8")
        return {
            "type": "video",
            "detections": final_detections,
            "count": len(final_detections),
            "annotated_data": f"data:video/mp4;base64,{base64_video}"
        }
    finally:
        if os.path.exists(out_path):
            try: 
                os.unlink(out_path)
            except: 
                pass

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    model = app_state.get("yolo")
    if not model: raise HTTPException(status_code=503, detail="Model Loading...")
    
    content_type = file.content_type
    if content_type.startswith("image/"):
        contents = await file.read()
        return process_image(model, contents)
    elif content_type.startswith("video/"):
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_in:
            shutil.copyfileobj(file.file, temp_in)
            temp_in_path = temp_in.name 
        try:
            result = process_video(model, temp_in_path)
            return result
        finally:
            if os.path.exists(temp_in_path):
                try: 
                    os.unlink(temp_in_path) 
                except: 
                    pass
    else:
        raise HTTPException(status_code=400, detail="File error.")


# python -m uvicorn host_model:app --reload --host 0.0.0.0 --port 8000

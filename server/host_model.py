import io
import torch
import torchvision
from torch import nn
from torchvision import transforms
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from contextlib import asynccontextmanager
from pathlib import Path

# --- CẤU HÌNH QUAN TRỌNG ---


def load_class_names(file_path: str) -> list[str]:
    """Đọc file .txt và trả về một danh sách các class name."""
    try:
        with open(file_path, "r") as f:
            class_names = [line.strip() for line in f if line.strip()]
        if not class_names:
            raise ValueError("File class rỗng")
        print(f"Đã tải thành công {len(class_names)} class name.")
        return class_names
    except FileNotFoundError:
        print(f"LỖI: Không tìm thấy file class '{file_path}'.")
        raise
    except Exception as e:
        print(f"LỖI: Không thể đọc file class. Lỗi: {e}")
        raise


def create_model(num_classes: int, device: str):
    """
    Tạo kiến trúc model EfficientNet-B1 TRỐNG
    (Chúng ta sẽ tải toàn bộ trọng số từ file .pth)
    """
    # 1. Tải kiến trúc model, KHÔNG tải trọng số (weights=None)
    model = torchvision.models.efficientnet_b1(weights=None)

    # 2. Thay thế lớp classifier cuối cùng
    output_shape = num_classes
    model.classifier = torch.nn.Sequential(
        torch.nn.Dropout(p=0.2, inplace=True),
        torch.nn.Linear(in_features=1280, out_features=output_shape, bias=True),
    ).to(device) # Gửi classifier đến device

    return model.to(device) # Gửi toàn bộ model đến device


# --- KẾT THÚC HÀM CẦN THÊM ---

# 2. Định nghĩa thiết bị
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Đang sử dụng thiết bị: {DEVICE}")

# 1. Tự động tải class names từ file
CLASSES_FILE_PATH = "../classes.txt" 
CLASS_NAMES = load_class_names(CLASSES_FILE_PATH)

# 3. Tên file .pth của bạn
MODEL_PATH = "../model/efficientnetb1_5epochs_weights.pth" 

# 4. Định nghĩa các bước xử lý ảnh (transforms)
# Vẫn PHẢI dùng transforms có Normalize,
# vì model của bạn được huấn luyện dựa trên nó.
print("Đang tải transforms mặc định (có Normalize)...")
model_weights = torchvision.models.EfficientNet_B1_Weights.DEFAULT
auto_transforms = transforms.Compose([
    transforms.Resize((224, 224)),  
    transforms.ToTensor(),
])
print("Transforms đã tải xong.")

# --- KHỞI TẠO APP VÀ TẢI MODEL ---
app_models = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Creating model structure and loading weights from {MODEL_PATH}...")
    try:
        # 1. TẠO KIẾN TRÚC MODEL TRỐNG
        model = create_model(num_classes=len(CLASS_NAMES), device=DEVICE)

        # 2. TẢI TOÀN BỘ STATE DICT
        # Bỏ 'strict=False' vì file .pth này chứa TẤT CẢ trọng số
        model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))

        # 3. CHUYỂN SANG CHẾ ĐỘ EVAL
        model.eval()
        app_models["efficientnet_b1"] = model
        print("Model loaded successfully.")

    except FileNotFoundError:
        print(f"LỖI: Không tìm thấy file model '{MODEL_PATH}'.")
        raise
    except Exception as e:
        print(f"LỖI: Không thể tải model. Lỗi: {e}")
        if "size mismatch" in str(e):
             print("LỖI GỢI Ý: Số class trong 'classes.txt' không khớp với model.")
        raise

    yield  # Server sẵn sàng nhận request
    print("Cleaning up...")
    app_models.clear()


app = FastAPI(lifespan=lifespan)

# --- ĐỊNH NGHĨA ENDPOINT ---

@app.get("/")
def read_root():
    return {"message": f"API dự đoán cho {len(CLASS_NAMES)} class"}

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Nhận file ảnh, dự đoán và trả về class cùng độ tự tin.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File không phải là ảnh.")

    contents = await file.read()
    image = Image.open(io.BytesIO(contents))

    if image.mode != "RGB":
        image = image.convert("RGB")

    try:
        image_tensor = auto_transforms(image).unsqueeze(0).to(DEVICE)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xử lý ảnh: {e}")

    model = app_models.get("efficientnet_b1")
    if model is None:
        raise HTTPException(status_code=503, detail="Model chưa được tải.")

    with torch.inference_mode():
        output_logits = model(image_tensor)

    probs = torch.softmax(output_logits, dim=1)
    pred_prob, pred_label_idx = torch.max(probs, dim=1)
    pred_class_idx = pred_label_idx.item()

    if pred_class_idx >= len(CLASS_NAMES):
        print(f"LỖI: Model dự đoán index {pred_class_idx} ngoài phạm vi {len(CLASS_NAMES)} class.")
        raise HTTPException(status_code=500, detail="Lỗi khớp model và class name")

    pred_class = CLASS_NAMES[pred_class_idx]
    pred_confidence = pred_prob.item()

    return {
        "predicted_class": pred_class,
        "confidence": f"{pred_confidence:.4f}",
        "all_probabilities": {
            CLASS_NAMES[i]: probs[0][i].item() for i in range(len(CLASS_NAMES))
        },
    }

# Lệnh chạy:
# uvicorn host_model:app --reload --host 0.0.0.0 --port 8000
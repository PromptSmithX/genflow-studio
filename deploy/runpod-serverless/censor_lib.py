import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Path to 640m onnx detector model
MODEL_PATH = os.environ.get("CENSOR_MODEL_PATH", "/models/640m.onnx")
# Inference resolution for NudeDetector
INFER_RES = int(os.environ.get("CENSOR_INFERENCE_RESOLUTION", "640"))

# Balanced: only exposed classes are targeted
TARGET_CLASSES = {
    "FEMALE_BREAST_EXPOSED", "FEMALE_GENITALIA_EXPOSED",
    "MALE_GENITALIA_EXPOSED", "BUTTOCKS_EXPOSED", "ANUS_EXPOSED",
}

# Detector singleton instance
_detector = None

# Lazy initialize detector on first use
def get_detector():
    global _detector
    if _detector is None:
        from nudenet import NudeDetector
        _detector = NudeDetector(model_path=MODEL_PATH, inference_resolution=INFER_RES)
    return _detector

# Censor sensitive regions using Gaussian blur and soft feathered mask
def censor_image(photo, threshold=0.25, padding=0.35, blur_radius=45, feather=8):
    detector = get_detector()
    bgr = np.asarray(photo)[:, :, ::-1].copy()
    detections = detector.detect(bgr)
    width, height = photo.size
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    hit = False
    for item in detections:
        if str(item["class"]) not in TARGET_CLASSES or float(item["score"]) < threshold:
            continue
        x, y, w, h = (int(v) for v in item["box"])
        pad_x = max(12, int(w * padding)); pad_y = max(12, int(h * padding))
        x1 = max(0, x - pad_x); y1 = max(0, y - pad_y)
        x2 = min(width, x + w + pad_x); y2 = min(height, y + h + pad_y)
        if x2 <= x1 or y2 <= y1:
            continue
        draw.rounded_rectangle((x1, y1, x2, y2), radius=min(18, (x2 - x1) // 4, (y2 - y1) // 4), fill=255)
        hit = True
    if not hit:
        return photo, "clean"
    blurred = photo.filter(ImageFilter.GaussianBlur(blur_radius))
    soft = mask.filter(ImageFilter.GaussianBlur(feather))
    return Image.composite(blurred, photo, soft), "censored"

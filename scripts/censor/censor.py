"""RICEE auto-censor sidecar.

Runs locally on CPU via NudeNet (ONNX) to blur sensitive regions in a batch of
images. Invoked by lib/censor/run-censor.ts as a subprocess, once per
GenerationJob, so the NudeNet model is loaded a single time for every image in
that job instead of once per image.

Input: a single argv -- the path to a manifest JSON file:
    {
      "items": [{"input": "<abs path>", "output": "<abs path>"}, ...],
      "threshold": 0.25,
      "padding": 0.20,
      "blur_radius": 35,
      "feather": 8
    }

Output: a single JSON object printed to stdout:
    {"results": [{"input":.., "output":.., "status": "censored"|"clean"|"failed",
                  "regions": [...], "error": "..."?}]}

Ported from RICEE_Day7_Full_Recovery_LUSTIFY_v10_Calendar_YEAR_T4.ipynb, cell
"AUTO CENSOR V3": same target classes, same soft-mask blur approach. Unlike
the notebook, an image with no detections is copied through unchanged
("clean") instead of being blurred wholesale -- the calendar has many clean
cover/artwork images that should not come out blurred.

The core `censor_image()` works on an in-memory PIL image + a loaded detector
so the same logic can be reused by the GPU cloud sidecar (censor_server.py in
the Colab notebook) without going through disk.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Balanced mode: only ever blur regions NudeNet reports as EXPOSED, never the
# COVERED variants -- so a clothed / bikini image is not blurred by mistake.
TARGET_CLASSES = {
    "FEMALE_BREAST_EXPOSED",
    "FEMALE_GENITALIA_EXPOSED",
    "MALE_GENITALIA_EXPOSED",
    "BUTTOCKS_EXPOSED",
    "ANUS_EXPOSED",
}

# Defaults tuned up from the first pass: wider padding + stronger blur so the
# soft mask actually covers the edges of a detected region instead of leaving a
# visible rim. Overridable per-call from the manifest.
DEFAULT_THRESHOLD = 0.25
DEFAULT_PADDING = 0.35
DEFAULT_BLUR_RADIUS = 45
DEFAULT_FEATHER = 8


def censor_image(detector, photo: Image.Image, threshold: float, padding: float,
                 blur_radius: float, feather: float):
    """Detect + soft-mask-blur sensitive regions on an in-memory RGB image.

    Returns (result_image, status, regions). On "clean" the returned image is
    the untouched input, so callers can always save/return one image.
    """
    # NudeNet's detect() takes a path/ndarray/bytes, not a PIL image, and mirrors
    # cv2.imread (BGR) internally before swapRB. Feed it a BGR array so the model
    # sees the same channel order as the proven file-path call.
    bgr = np.asarray(photo)[:, :, ::-1].copy()
    detections = detector.detect(bgr)
    width, height = photo.size

    selected = []
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)

    for item in detections:
        label = str(item["class"])
        score = float(item["score"])
        if label not in TARGET_CLASSES or score < threshold:
            continue

        x, y, w, h = (int(v) for v in item["box"])
        pad_x = max(12, int(w * padding))
        pad_y = max(12, int(h * padding))
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(width, x + w + pad_x)
        y2 = min(height, y + h + pad_y)
        if x2 <= x1 or y2 <= y1:
            continue

        draw.rounded_rectangle(
            (x1, y1, x2, y2),
            radius=min(18, (x2 - x1) // 4, (y2 - y1) // 4),
            fill=255,
        )
        selected.append({"class": label, "score": score, "box": [x1, y1, x2, y2]})

    if not selected:
        return photo, "clean", []

    blurred_photo = photo.filter(ImageFilter.GaussianBlur(blur_radius))
    soft_mask = mask.filter(ImageFilter.GaussianBlur(feather))
    result = Image.composite(blurred_photo, photo, soft_mask)
    return result, "censored", selected


def censor_one(detector, input_path: Path, output_path: Path, threshold: float, padding: float,
                blur_radius: float, feather: float) -> dict:
    photo = Image.open(input_path).convert("RGB")
    result, status, regions = censor_image(detector, photo, threshold, padding, blur_radius, feather)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Both "clean" (unchanged pass-through) and "censored" write a file, so the
    # masked copy always exists on disk mirroring the full output set.
    result.save(output_path)
    return {"status": status, "regions": regions}


def load_detector(model_path: str = "", inference_resolution: int = 320):
    """Loads NudeDetector, optionally with a bigger model (e.g. 640m.onnx at
    inference_resolution=640) for better recall on anime/stylized content."""
    from nudenet import NudeDetector

    if model_path:
        return NudeDetector(model_path=model_path, inference_resolution=inference_resolution)
    return NudeDetector()


def main() -> int:
    manifest_path = Path(sys.argv[1])
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    threshold = float(manifest.get("threshold", DEFAULT_THRESHOLD))
    padding = float(manifest.get("padding", DEFAULT_PADDING))
    blur_radius = float(manifest.get("blur_radius", DEFAULT_BLUR_RADIUS))
    feather = float(manifest.get("feather", DEFAULT_FEATHER))
    model_path = str(manifest.get("model_path", "") or "")
    inference_resolution = int(manifest.get("inference_resolution", 320))

    detector = load_detector(model_path, inference_resolution)

    results = []
    for item in manifest.get("items", []):
        input_path = Path(item["input"])
        output_path = Path(item["output"])
        try:
            outcome = censor_one(detector, input_path, output_path, threshold, padding, blur_radius, feather)
            results.append({"input": str(input_path), "output": str(output_path), **outcome})
        except Exception as exc:  # noqa: BLE001 - one bad image must not fail the whole batch
            results.append({
                "input": str(input_path),
                "output": str(output_path),
                "status": "failed",
                "regions": [],
                "error": str(exc),
            })

    print(json.dumps({"results": results}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

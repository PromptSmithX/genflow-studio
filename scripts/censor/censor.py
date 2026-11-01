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
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

TARGET_CLASSES = {
    "FEMALE_BREAST_EXPOSED",
    "FEMALE_GENITALIA_EXPOSED",
    "ANUS_EXPOSED",
}


def censor_one(detector, input_path: Path, output_path: Path, threshold: float, padding: float,
                blur_radius: float, feather: float) -> dict:
    detections = detector.detect(str(input_path))

    photo = Image.open(input_path).convert("RGB")
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

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not selected:
        # No sensitive region found -> pass the image through unchanged so the
        # masked copy still exists on disk, mirroring the full output set.
        photo.save(output_path)
        return {"status": "clean", "regions": []}

    blurred_photo = photo.filter(ImageFilter.GaussianBlur(blur_radius))
    soft_mask = mask.filter(ImageFilter.GaussianBlur(feather))
    result = Image.composite(blurred_photo, photo, soft_mask)
    result.save(output_path)
    return {"status": "censored", "regions": selected}


def main() -> int:
    manifest_path = Path(sys.argv[1])
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    threshold = float(manifest.get("threshold", 0.25))
    padding = float(manifest.get("padding", 0.20))
    blur_radius = float(manifest.get("blur_radius", 35))
    feather = float(manifest.get("feather", 8))

    from nudenet import NudeDetector

    detector = NudeDetector()

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

#!/usr/bin/env python3
"""
Wrap calendar images into realistic product mockup scenes using 4-point homography
perspective transforms and multiply blending with ambient shadows and hardware details.
"""

import argparse
import json
import os
import sys
from typing import List, Tuple, Dict, Any
import numpy as np
from PIL import Image, ImageDraw

# Default template folder
DEFAULT_TEMPLATE_DIR = r"D:\model_gen_anh_local_18\MVP_workflow\mockup"

# Quad coordinates: [(Top-Left), (Top-Right), (Bottom-Right), (Bottom-Left)]
QUAD_COVERS_FRONT: List[Tuple[float, float]] = [(196, 386), (1079, 237), (1188, 949), (305, 1098)]
QUAD_COVERS_BACK: List[Tuple[float, float]] = [(965, 1076), (1832, 1090), (1780, 1790), (925, 1750)]

# Quarters (Q1, Q2, Q3, Q4 all share identical geometry)
QUAD_QUARTER_LEFT: List[Tuple[float, float]] = [(395, 288), (968, 483), (794, 963), (240, 755)]
QUAD_QUARTER_RIGHT: List[Tuple[float, float]] = [(1055, 320), (1600, 98), (1790, 558), (1235, 780)]
QUAD_QUARTER_BOTTOM: List[Tuple[float, float]] = [(752, 966), (1358, 946), (1376, 1422), (764, 1450)]

WHITE_POINT = 236.0  # Measured paper white point in templates for natural color preservation


def compute_perspective_coeffs(dest_pts: List[Tuple[float, float]], src_pts: List[Tuple[float, float]]) -> List[float]:
    """
    Computes the 8 coefficients for Pillow's PERSPECTIVE transform,
    which maps from destination coordinates back to source coordinates.
    """
    matrix = []
    for p_dest, p_src in zip(dest_pts, src_pts):
        matrix.append([p_dest[0], p_dest[1], 1, 0, 0, 0, -p_src[0] * p_dest[0], -p_src[0] * p_dest[1]])
        matrix.append([0, 0, 0, p_dest[0], p_dest[1], 1, -p_src[1] * p_dest[0], -p_src[1] * p_dest[1]])
    A = np.matrix(matrix, dtype=float)
    B = np.array(p_src_list := [coord for pt in src_pts for coord in pt]).reshape(8)
    res = np.dot(np.linalg.inv(A.T * A) * A.T, B)
    return list(np.array(res).reshape(8))


def warp_and_blend_template(
    template_path: str,
    slots: List[Dict[str, Any]],
    output_path: str,
) -> None:
    """
    Warps images into designated slots and multiply-blends onto template.
    slots: List of {'image_path': str, 'quad': List[Tuple[float, float]]}
    """
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")

    template_img = Image.open(template_path).convert("RGB")
    canvas_w, canvas_h = template_img.size

    tmpl_arr = np.array(template_img, dtype=float)
    composite_warped = np.zeros_like(tmpl_arr)
    mask_full = Image.new("L", (canvas_w, canvas_h), 0)
    mask_draw = ImageDraw.Draw(mask_full)

    for slot in slots:
        img_path = slot["image_path"]
        quad = slot["quad"]
        if not os.path.exists(img_path):
            raise FileNotFoundError(f"Artwork image not found: {img_path}")

        artwork = Image.open(img_path).convert("RGB")
        art_w, art_h = artwork.size
        src_corners = [(0.0, 0.0), (float(art_w), 0.0), (float(art_w), float(art_h)), (0.0, float(art_h))]

        coeffs = compute_perspective_coeffs(quad, src_corners)
        warped = artwork.transform(
            (canvas_w, canvas_h),
            Image.Transform.PERSPECTIVE,
            coeffs,
            Image.Resampling.BICUBIC,
        )

        # Draw slot onto full mask (order matters for overlapping quads)
        mask_draw.polygon(quad, fill=255)
        # Add to composite warped
        slot_mask = Image.new("L", (canvas_w, canvas_h), 0)
        ImageDraw.Draw(slot_mask).polygon(quad, fill=255)
        slot_mask_arr = np.array(slot_mask, dtype=float) / 255.0
        composite_warped = composite_warped * (1.0 - slot_mask_arr[:, :, None]) + np.array(warped, dtype=float) * slot_mask_arr[:, :, None]

    mask_arr = np.array(mask_full, dtype=float) / 255.0

    # Multiply blend normalized by paper white point
    blended = np.clip((tmpl_arr / WHITE_POINT) * composite_warped, 0.0, 255.0)
    result_arr = tmpl_arr * (1.0 - mask_arr[:, :, None]) + blended * mask_arr[:, :, None]

    result = Image.fromarray(result_arr.astype(np.uint8))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    result.save(output_path, "PNG", optimize=True)


def generate_all_mockups(images: List[str], template_dir: str, output_dir: str) -> List[str]:
    """
    Generates 5 mockup images for the 14 calendar images.
    images: 14 file paths in order:
      [0]: 00_bia-truoc.png
      [1..12]: 01.png .. 12.png (Months 1-12)
      [13]: 13_bia-sau.png
    """
    if len(images) < 14:
        raise ValueError(f"Expected 14 images, received {len(images)}")

    covers_template = os.path.join(template_dir, "Context Covers.png")
    q1_template = os.path.join(template_dir, "Context Q1.png")
    q2_template = os.path.join(template_dir, "Context Q2.png")
    q3_template = os.path.join(template_dir, "Context Q3.png")
    q4_template = os.path.join(template_dir, "Context Q4.png")

    os.makedirs(output_dir, exist_ok=True)
    generated_files = []

    # 1. 00_mockup_covers.png: Front cover + Back cover
    out_covers = os.path.join(output_dir, "00_mockup_covers.png")
    warp_and_blend_template(
        covers_template,
        [
            {"image_path": images[0], "quad": QUAD_COVERS_FRONT},
            {"image_path": images[13], "quad": QUAD_COVERS_BACK},
        ],
        out_covers,
    )
    generated_files.append(out_covers)

    # 2. 01_mockup_q1.png: Jan, Feb, Mar (draw Left, Right, then Bottom on top)
    out_q1 = os.path.join(output_dir, "01_mockup_q1.png")
    warp_and_blend_template(
        q1_template,
        [
            {"image_path": images[1], "quad": QUAD_QUARTER_LEFT},   # Jan (01)
            {"image_path": images[3], "quad": QUAD_QUARTER_RIGHT},  # Mar (03)
            {"image_path": images[2], "quad": QUAD_QUARTER_BOTTOM}, # Feb (02)
        ],
        out_q1,
    )
    generated_files.append(out_q1)

    # 3. 02_mockup_q2.png: Apr, May, Jun
    out_q2 = os.path.join(output_dir, "02_mockup_q2.png")
    warp_and_blend_template(
        q2_template,
        [
            {"image_path": images[4], "quad": QUAD_QUARTER_LEFT},   # Apr (04)
            {"image_path": images[6], "quad": QUAD_QUARTER_RIGHT},  # Jun (06)
            {"image_path": images[5], "quad": QUAD_QUARTER_BOTTOM}, # May (05)
        ],
        out_q2,
    )
    generated_files.append(out_q2)

    # 4. 03_mockup_q3.png: Jul, Aug, Sep
    out_q3 = os.path.join(output_dir, "03_mockup_q3.png")
    warp_and_blend_template(
        q3_template,
        [
            {"image_path": images[7], "quad": QUAD_QUARTER_LEFT},   # Jul (07)
            {"image_path": images[9], "quad": QUAD_QUARTER_RIGHT},  # Sep (09)
            {"image_path": images[8], "quad": QUAD_QUARTER_BOTTOM}, # Aug (08)
        ],
        out_q3,
    )
    generated_files.append(out_q3)

    # 5. 04_mockup_q4.png: Oct, Nov, Dec
    out_q4 = os.path.join(output_dir, "04_mockup_q4.png")
    warp_and_blend_template(
        q4_template,
        [
            {"image_path": images[10], "quad": QUAD_QUARTER_LEFT},   # Oct (10)
            {"image_path": images[12], "quad": QUAD_QUARTER_RIGHT},  # Dec (12)
            {"image_path": images[11], "quad": QUAD_QUARTER_BOTTOM}, # Nov (11)
        ],
        out_q4,
    )
    generated_files.append(out_q4)

    return generated_files


def main():
    parser = argparse.ArgumentParser(description="Wrap 14 calendar images into 5 product mockup scenes.")
    parser.add_argument("--config", type=str, help="Path to JSON config file or raw JSON string")
    parser.add_argument("--template-dir", type=str, default=DEFAULT_TEMPLATE_DIR, help="Path to mockup templates")
    parser.add_argument("--output-dir", type=str, help="Destination folder for mockup images")
    parser.add_argument("--images", nargs="+", help="14 input image file paths")

    args = parser.parse_args()

    if args.config:
        if os.path.exists(args.config):
            with open(args.config, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = json.loads(args.config)
        template_dir = data.get("templateDir", DEFAULT_TEMPLATE_DIR)
        output_dir = data["outputDir"]
        images = data["images"]
    else:
        if not args.output_dir or not args.images:
            parser.error("Either --config or both --output-dir and --images must be specified")
        template_dir = args.template_dir
        output_dir = args.output_dir
        images = args.images

    try:
        results = generate_all_mockups(images, template_dir, output_dir)
        print(json.dumps({"success": True, "files": [os.path.basename(f) for f in results]}))
    except Exception as e:
        sys.stderr.write(f"Error wrapping mockups: {e}\n")
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

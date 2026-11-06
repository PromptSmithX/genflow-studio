#!/usr/bin/env python3
"""
Wrap calendar images into realistic product mockup scenes using 4-point homography
perspective transforms and multiply blending with ambient shadows and hardware details.

Quality pipeline:
- 3x supersampled warp + LANCZOS downscale (anti-aliased edges, sharp detail)
- Soft (anti-aliased) alpha masks instead of hard polygons (no jagged seams)
- Small outward bleed per slot (no white sliver at the paper edge)
- Per-template sampled paper white point for the multiply blend (natural shading)

Dev helper: `--calibrate` draws the quad outlines + labelled corners onto each
template into <template_dir>/_calibrate/ so placement coords can be dialed in.
"""

import argparse
import json
import os
import sys
from typing import List, Tuple, Dict, Any
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Default template folder
DEFAULT_TEMPLATE_DIR = r"D:\model_gen_anh_local_18\MVP_workflow\mockup"

# Quad coordinates: [(Top-Left), (Top-Right), (Bottom-Right), (Bottom-Left)] in the
# orientation of the print file. Each quad is the WHOLE physical sheet the full-bleed
# print page covers (spiral strip + hanging hole included), so the template's wire and
# hole land on the artwork's own keep-out zones. Free edges and the covers' spiral edge
# are sub-pixel line fits of the paper edge. On month pages the photo sheet and the
# calendar sheet meet at the wire, so the hinge edge is the midline between the two
# punched-hole rows (photo sheet's row above, calendar sheet's row below).
# The hanging hole lands within ~4px of the template's hole on every sheet.
QUAD_COVERS_FRONT: List[Tuple[float, float]] = [(195.2, 374.0), (1077.0, 232.7), (1187.2, 953.6), (324.6, 1088.4)]
QUAD_COVERS_BACK: List[Tuple[float, float]] = [(960.4, 1051.0), (1832.2, 1092.6), (1780.4, 1784.5), (927.3, 1744.0)]

# Quarters (Q1, Q2, Q3, Q4 share identical geometry — verified to 0.0px)
QUAD_QUARTER_LEFT: List[Tuple[float, float]] = [(406.0, 287.3), (971.7, 503.7), (799.1, 963.2), (241.6, 749.7)]
QUAD_QUARTER_RIGHT: List[Tuple[float, float]] = [(1054.9, 318.1), (1622.4, 95.5), (1790.4, 560.7), (1231.1, 780.3)]
QUAD_QUARTER_BOTTOM: List[Tuple[float, float]] = [(746.0, 998.6), (1336.7, 940.7), (1378.9, 1414.2), (797.4, 1471.1)]

SUPERSAMPLE = 3          # Render warp at this factor, then downscale (anti-aliasing)
BLEED_FRAC = 0.0015      # Sub-pixel outward nudge on free edges so the art stays full-bleed
# The spiral edge is pulled IN instead: just outside it the template is background/edge
# shadow, and art covering it would multiply into a dark line running across the wire.
HINGE_INSET_PX = 1.2
WHITE_PERCENTILE = 99.0  # Percentile of template luminance treated as paper white

# Multiply can only darken, so the silver wire and punched holes vanish over dark art.
# Inside the spiral strip and around the hanging hole, template pixels that are brighter
# than paper (wire highlights) or far darker (holes) are laid back on top of the artwork.
HINGE_BAND_FRAC = 0.08   # Spiral-strip depth as a fraction of print height (keep_out ≈ 0.055)
WIRE_MAX_DEPTH_FRAC = 0.06  # Max distance (print height fraction) a wire stem runs onto the sheet
HANG_HOLE_FROM_EDGE_PX = 112.0  # format.json: hole centre distance from the free edge
HANG_HOLE_RADIUS_PX = 70.0


def compute_perspective_coeffs(dest_pts: List[Tuple[float, float]], src_pts: List[Tuple[float, float]]) -> List[float]:
    """
    Computes the 8 coefficients for Pillow's PERSPECTIVE transform, which maps from
    destination coordinates back to source coordinates. The system is exactly
    determined (8 equations, 8 unknowns), so it is solved directly.
    """
    matrix = []
    b = []
    for p_dest, p_src in zip(dest_pts, src_pts):
        matrix.append([p_dest[0], p_dest[1], 1, 0, 0, 0, -p_src[0] * p_dest[0], -p_src[0] * p_dest[1]])
        matrix.append([0, 0, 0, p_dest[0], p_dest[1], 1, -p_src[1] * p_dest[0], -p_src[1] * p_dest[1]])
        b.append(p_src[0])
        b.append(p_src[1])
    A = np.array(matrix, dtype=float)
    B = np.array(b, dtype=float)
    res = np.linalg.solve(A, B)
    return list(res)


def expand_quad(quad: List[Tuple[float, float]], bleed_frac: float) -> List[Tuple[float, float]]:
    """Pushes each corner outward from the quad centroid to bleed under the paper edge."""
    cx = sum(p[0] for p in quad) / len(quad)
    cy = sum(p[1] for p in quad) / len(quad)
    return [(cx + (x - cx) * (1.0 + bleed_frac), cy + (y - cy) * (1.0 + bleed_frac)) for (x, y) in quad]


def sample_white_point(tmpl_arr: np.ndarray) -> np.ndarray:
    """
    Estimates the paper white point per channel from the bright regions of the template.
    Using a high percentile neutralises slight paper tint and keeps shadows as a ratio.
    """
    lum = tmpl_arr @ np.array([0.299, 0.587, 0.114])
    thresh = np.percentile(lum, 85.0)
    bright = tmpl_arr[lum >= thresh]
    if bright.size == 0:
        return np.array([236.0, 236.0, 236.0])
    white = np.percentile(bright, WHITE_PERCENTILE, axis=0)
    return np.clip(white, 1.0, 255.0)


def inset_hinge(quad: List[Tuple[float, float]], hinge: str, px: float) -> List[Tuple[float, float]]:
    """Moves the two hinge-edge corners inward along the sheet sides by px."""
    q = [np.array(p, dtype=float) for p in quad]
    pairs = [(0, 3), (1, 2)] if hinge == "top" else [(3, 0), (2, 1)]
    for edge_i, far_i in pairs:
        d = q[far_i] - q[edge_i]
        q[edge_i] = q[edge_i] + d / np.linalg.norm(d) * px
    return [(float(p[0]), float(p[1])) for p in q]


def _bilinear(img: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    h, w = img.shape
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = x - x0
    fy = y - y0
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def wire_layer(
    tmpl_lum: np.ndarray,
    tmpl_rgb: np.ndarray,
    white_lum: float,
    sheet_quad: List[Tuple[float, float]],
    bbox: Tuple[int, int, int, int],
    hinge: str,
) -> Tuple[np.ndarray, np.ndarray]:
    """(alpha, rgb) of the spiral wire stems that run from the sheet edge onto the sheet
    (and so over the artwork), for the slot bbox. Stems are found just OUTSIDE the edge,
    where they contrast with what lies beyond, then extended inward to the punched hole
    carrying that outside wire colour (copying the inside would paste white paper)."""
    x0, y0, x1, y1 = bbox
    q = [np.array(p, dtype=float) for p in sheet_quad]
    # Unit-square sheet coords (u along the hinge edge, t = depth from the hinge edge).
    if hinge == "top":
        e0, e1, f0, f1 = q[0], q[1], q[3], q[2]
    else:
        e0, e1, f0, f1 = q[3], q[2], q[0], q[1]
    unit = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    to_dest = compute_perspective_coeffs(unit, [tuple(e0), tuple(e1), tuple(f1), tuple(f0)])
    to_unit = compute_perspective_coeffs([tuple(e0), tuple(e1), tuple(f1), tuple(f0)], unit)

    def map_pts(c, xs, ys):
        a, b, cc, d, e, f, g, h = c
        den = g * xs + h * ys + 1.0
        return (a * xs + b * ys + cc) / den, (d * xs + e * ys + f) / den

    edge_len = float(np.linalg.norm(e1 - e0))
    depth_len = float(np.linalg.norm(f0 - e0))  # sheet depth in dest px
    n_u = max(64, int(edge_len * 2))
    px = 1.0 / depth_len                          # one dest px in t units
    max_depth = WIRE_MAX_DEPTH_FRAC
    ts = np.arange(-4.0 * px, max_depth + px * 0.5, px * 0.5)
    us = (np.arange(n_u) + 0.5) / n_u
    U, Tt = np.meshgrid(us, ts)
    dx, dy = map_pts(to_dest, U, Tt)
    strip = _bilinear(tmpl_lum, dx, dy)          # rows = depth, cols = along edge

    out_rows = (ts >= -3.5 * px) & (ts <= -1.5 * px)
    outside = strip[out_rows].mean(axis=0)
    out_rgb = np.stack([_bilinear(tmpl_rgb[:, :, k], dx[out_rows], dy[out_rows]).mean(axis=0)
                        for k in range(3)], axis=1)        # (n_u, 3) wire colour per column
    win = max(9, int(n_u / edge_len * 30) | 1)  # ~30 dest px running median
    pad = np.pad(outside, win // 2, mode="edge")
    base = np.median(np.lib.stride_tricks.sliding_window_view(pad, win), axis=1)
    # Bright metal only: on month pages the next sheet's punched holes sit right past the
    # edge, and treating dark pixels as wire would cut dark/white notches into the art.
    stroke = np.clip((outside - base - 2.0) / 7.0, 0, 1)

    inside = ts >= 0
    hole = strip[inside] < (white_lum - 35.0)
    first = np.where(hole.any(axis=0), hole.argmax(axis=0), -1)
    n_in = inside.sum()
    rows = np.arange(n_in)[:, None]
    reach = np.where(first >= 0, first + 2, int(2 * 2))  # into the hole, else a short stub
    wire = np.zeros_like(strip)
    wire[inside] = np.where(rows <= reach[None, :], stroke[None, :], 0.0)

    gx, gy = np.meshgrid(np.arange(x0, x1, dtype=float) + 0.5, np.arange(y0, y1, dtype=float) + 0.5)
    uu, tt = map_pts(to_unit, gx, gy)
    ci = uu * n_u - 0.5
    ri = (tt - ts[0]) / (px * 0.5)
    ok = (uu >= 0) & (uu <= 1) & (tt >= 0) & (tt <= max_depth)
    alpha = np.where(ok, _bilinear(wire, ci, ri), 0.0)
    cif = np.clip(ci, 0, n_u - 1.001)
    c0 = np.floor(cif).astype(int)
    fr = (cif - c0)[:, :, None]
    rgb = out_rgb[c0] * (1 - fr) + out_rgb[c0 + 1] * fr
    return alpha, rgb


def hardware_alpha(
    tmpl_lum: np.ndarray,
    white_lum: float,
    coeffs_px: List[float],
    art_w: int,
    art_h: int,
    hinge: str,
) -> np.ndarray:
    """Opacity of template hardware (wire, punched holes, hanging hole) over the art,
    for a slot's local bbox. coeffs_px map local dest pixels -> artwork pixels."""
    h, w = tmpl_lum.shape
    gx, gy = np.meshgrid(np.arange(w, dtype=float) + 0.5, np.arange(h, dtype=float) + 0.5)
    a, b, c, d, e, f, g, hh = coeffs_px
    den = g * gx + hh * gy + 1.0
    u = (a * gx + b * gy + c) / den
    v = (d * gx + e * gy + f) / den

    band = HINGE_BAND_FRAC * art_h
    if hinge == "top":
        region = v < band
        hole_v = art_h - HANG_HOLE_FROM_EDGE_PX
    else:
        region = v > art_h - band
        hole_v = HANG_HOLE_FROM_EDGE_PX
    r = HANG_HOLE_RADIUS_PX * 1.6
    region |= (u - art_w / 2.0) ** 2 + (v - hole_v) ** 2 < r * r

    brighter = np.clip((tmpl_lum - white_lum - 6.0) / 10.0, 0.0, 1.0)
    darker = np.clip((white_lum - tmpl_lum - 35.0) / 30.0, 0.0, 1.0)
    return np.maximum(brighter, darker) * region


def warp_and_blend_template(
    template_path: str,
    slots: List[Dict[str, Any]],
    output_path: str,
    hinge: str = "bottom",
) -> None:
    """
    Warps images into designated slots and multiply-blends onto template.
    slots: List of {'image_path': str, 'quad': List[Tuple[float, float]]}
    hinge: which edge of the print file carries the spiral ("top" covers, "bottom" months).
    Slots are composited in order (later slots paint on top of earlier ones).
    """
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")

    template_img = Image.open(template_path).convert("RGB")
    canvas_w, canvas_h = template_img.size
    tmpl_arr = np.array(template_img, dtype=float)
    # Smoothed luminance so single-pixel template noise is not mistaken for hardware.
    tmpl_lum = np.array(
        Image.fromarray(np.clip(tmpl_arr @ np.array([0.299, 0.587, 0.114]), 0, 255).astype(np.uint8))
        .filter(ImageFilter.BoxBlur(1)),
        dtype=float,
    )
    white = sample_white_point(tmpl_arr)
    white_lum = float(white @ np.array([0.299, 0.587, 0.114]))

    S = SUPERSAMPLE
    composite_warped = np.zeros((canvas_h, canvas_w, 3), dtype=float)
    composite_alpha = np.zeros((canvas_h, canvas_w), dtype=float)
    hw_alpha = np.zeros((canvas_h, canvas_w), dtype=float)
    wire_a = np.zeros((canvas_h, canvas_w), dtype=float)
    wire_rgb = np.zeros((canvas_h, canvas_w, 3), dtype=float)

    for slot in slots:
        img_path = slot["image_path"]
        if not os.path.exists(img_path):
            raise FileNotFoundError(f"Artwork image not found: {img_path}")

        sheet_quad = [(float(x), float(y)) for (x, y) in slot["quad"]]
        quad = inset_hinge(expand_quad(sheet_quad, BLEED_FRAC), hinge, HINGE_INSET_PX)

        # Integer bounding box of the quad on the template canvas (clamped).
        xs = [p[0] for p in quad]
        ys = [p[1] for p in quad]
        x0 = max(0, int(np.floor(min(xs))))
        y0 = max(0, int(np.floor(min(ys))))
        x1 = min(canvas_w, int(np.ceil(max(xs))))
        y1 = min(canvas_h, int(np.ceil(max(ys))))
        bw, bh = x1 - x0, y1 - y0
        if bw <= 0 or bh <= 0:
            continue

        artwork = Image.open(img_path).convert("RGB")
        art_w, art_h = artwork.size
        src_corners = [(0.0, 0.0), (float(art_w), 0.0), (float(art_w), float(art_h)), (0.0, float(art_h))]

        # Supersampled destination quad in local bbox coordinates.
        dest_local = [((x - x0) * S, (y - y0) * S) for (x, y) in quad]
        coeffs = compute_perspective_coeffs(dest_local, src_corners)

        warped_big = artwork.transform(
            (bw * S, bh * S),
            Image.Transform.PERSPECTIVE,
            coeffs,
            Image.Resampling.BICUBIC,
        )
        mask_big = Image.new("L", (bw * S, bh * S), 0)
        ImageDraw.Draw(mask_big).polygon(dest_local, fill=255)

        # Downscale premultiplied ("RGBa"): otherwise the black fill outside the quad is
        # averaged into the edge pixels and leaves a dark line along every sheet edge.
        rgba_big = warped_big.convert("RGBA")
        rgba_big.putalpha(mask_big)
        rgba = rgba_big.convert("RGBa").resize((bw, bh), Image.Resampling.LANCZOS).convert("RGBA")

        rgba_arr = np.array(rgba, dtype=float)
        warped_arr = rgba_arr[:, :, :3]
        a = (rgba_arr[:, :, 3] / 255.0)[:, :, None]

        region_rgb = composite_warped[y0:y1, x0:x1, :]
        region_a = composite_alpha[y0:y1, x0:x1, None]
        composite_warped[y0:y1, x0:x1, :] = region_rgb * (1.0 - a) + warped_arr * a
        composite_alpha[y0:y1, x0:x1] = (region_a * (1.0 - a) + a)[:, :, 0]

        dest_1x = [(x - x0, y - y0) for (x, y) in quad]
        hw = hardware_alpha(tmpl_lum[y0:y1, x0:x1], white_lum,
                            compute_perspective_coeffs(dest_1x, src_corners), art_w, art_h, hinge)
        a2 = a[:, :, 0]
        hw_alpha[y0:y1, x0:x1] = hw_alpha[y0:y1, x0:x1] * (1.0 - a2) + hw * a2

        wa, wrgb = wire_layer(tmpl_lum, tmpl_arr, white_lum, sheet_quad, (x0, y0, x1, y1), hinge)
        wa = wa * a2
        # Premultiplied: this sheet hides wire drawn for sheets beneath it, then adds its own.
        wire_rgb[y0:y1, x0:x1] = wire_rgb[y0:y1, x0:x1] * (1.0 - a2[:, :, None]) + wrgb * wa[:, :, None]
        wire_a[y0:y1, x0:x1] = wire_a[y0:y1, x0:x1] * (1.0 - a2) + wa

    alpha = composite_alpha[:, :, None]
    blended = np.clip((tmpl_arr / white) * composite_warped, 0.0, 255.0)
    result_arr = tmpl_arr * (1.0 - alpha) + blended * alpha
    hw_alpha = np.array(
        Image.fromarray((hw_alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)),
        dtype=float,
    ) / 255.0
    hwa = hw_alpha[:, :, None]
    result_arr = result_arr * (1.0 - hwa) + tmpl_arr * hwa
    wa = np.clip(wire_a, 0.0, 1.0)[:, :, None]
    result_arr = result_arr * (1.0 - wa) + wire_rgb

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
        hinge="top",
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


# ---------------------------------------------------------------------------
# Dev calibration helper
# ---------------------------------------------------------------------------

_CALIBRATE_LAYOUT = {
    "Context Covers.png": [("FRONT", QUAD_COVERS_FRONT, (0, 200, 0)),
                           ("BACK", QUAD_COVERS_BACK, (220, 0, 0))],
    "Context Q1.png": [("LEFT", QUAD_QUARTER_LEFT, (0, 200, 0)),
                       ("RIGHT", QUAD_QUARTER_RIGHT, (220, 0, 0)),
                       ("BOTTOM", QUAD_QUARTER_BOTTOM, (0, 80, 255))],
    "Context Q2.png": [("LEFT", QUAD_QUARTER_LEFT, (0, 200, 0)),
                       ("RIGHT", QUAD_QUARTER_RIGHT, (220, 0, 0)),
                       ("BOTTOM", QUAD_QUARTER_BOTTOM, (0, 80, 255))],
    "Context Q3.png": [("LEFT", QUAD_QUARTER_LEFT, (0, 200, 0)),
                       ("RIGHT", QUAD_QUARTER_RIGHT, (220, 0, 0)),
                       ("BOTTOM", QUAD_QUARTER_BOTTOM, (0, 80, 255))],
    "Context Q4.png": [("LEFT", QUAD_QUARTER_LEFT, (0, 200, 0)),
                       ("RIGHT", QUAD_QUARTER_RIGHT, (220, 0, 0)),
                       ("BOTTOM", QUAD_QUARTER_BOTTOM, (0, 80, 255))],
}

_CORNER_LABELS = ["TL", "TR", "BR", "BL"]


def run_calibration(template_dir: str) -> List[str]:
    """Draws quad outlines + labelled corners onto each template for visual tuning.
    Output goes to a temp dir so it never clutters the project / repo."""
    import tempfile
    out_dir = os.path.join(tempfile.gettempdir(), "anima_mockup_calibrate")
    os.makedirs(out_dir, exist_ok=True)
    try:
        font = ImageFont.truetype("arial.ttf", 22)
    except Exception:
        font = ImageFont.load_default()

    written = []
    for name, slots in _CALIBRATE_LAYOUT.items():
        path = os.path.join(template_dir, name)
        if not os.path.exists(path):
            continue
        img = Image.open(path).convert("RGB")
        draw = ImageDraw.Draw(img)
        for label, quad, color in slots:
            pts = [(float(x), float(y)) for (x, y) in quad]
            draw.line(pts + [pts[0]], fill=color, width=3)
            for i, (x, y) in enumerate(pts):
                r = 7
                draw.ellipse([x - r, y - r, x + r, y + r], outline=color, width=3)
                draw.text((x + 10, y - 10), f"{label[:1]}:{_CORNER_LABELS[i]} ({int(x)},{int(y)})",
                          fill=color, font=font)
        out_path = os.path.join(out_dir, f"calib_{name}")
        img.save(out_path, "PNG")
        written.append(out_path)
    return written


def main():
    parser = argparse.ArgumentParser(description="Wrap 14 calendar images into 5 product mockup scenes.")
    parser.add_argument("--config", type=str, help="Path to JSON config file or raw JSON string")
    parser.add_argument("--template-dir", type=str, default=DEFAULT_TEMPLATE_DIR, help="Path to mockup templates")
    parser.add_argument("--output-dir", type=str, help="Destination folder for mockup images")
    parser.add_argument("--images", nargs="+", help="14 input image file paths")
    parser.add_argument("--calibrate", action="store_true", help="Dev: draw quad overlays onto templates and exit")

    args = parser.parse_args()

    if args.calibrate:
        written = run_calibration(args.template_dir)
        print(json.dumps({"success": True, "calibrate": [os.path.basename(f) for f in written]}))
        return

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

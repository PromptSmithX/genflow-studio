import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import uuid
from typing import Any
import boto3
import requests

try:
    import runpod
except ImportError:
    runpod = None

COMFY_DIR = Path(os.environ.get("COMFY_DIR", "/comfyui"))
COMFY_PORT = int(os.environ.get("COMFY_PORT", "8188"))
COMFY_BASE_URL = f"http://127.0.0.1:{COMFY_PORT}"
DEFAULT_PREFIX = os.environ.get("RUNPOD_OUTPUT_PREFIX", "runpod-out")
DEFAULT_TIMEOUT_S = int(os.environ.get("COMFY_JOB_TIMEOUT_S", "600"))
TEMP_BASE = Path(os.environ.get("RUNPOD_TEMP_DIR", "/tmp" if os.path.exists("/tmp") else tempfile.gettempdir()))
CENSOR_VENV_PY = os.environ.get("CENSOR_PYTHON", "/opt/censor-venv/bin/python")
CENSOR_CLI_PATH = os.environ.get("CENSOR_CLI", "/censor_cli.py")

# Check if GPU total memory is 20 GiB or less
def detect_lowvram() -> bool:
    try:
        import torch
        if torch.cuda.is_available():
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            return vram_gb <= 20
    except Exception:
        pass
    return False

# Boot ComfyUI backend process and wait for ready state
def boot_comfyui() -> tuple[bool, str | None]:
    main_script = COMFY_DIR / "main.py"
    if not main_script.exists():
        return False, f"ComfyUI script not found at {main_script}"
    try:
        r = requests.get(f"{COMFY_BASE_URL}/system_stats", timeout=2)
        if r.status_code == 200:
            return True, None
    except Exception:
        pass
    cmd = [sys.executable, str(main_script), "--listen", "127.0.0.1", "--port", str(COMFY_PORT), "--disable-auto-launch"]
    if detect_lowvram():
        cmd.append("--lowvram")
    try:
        proc = subprocess.Popen(cmd, cwd=str(COMFY_DIR), stdout=sys.stdout, stderr=sys.stderr)
    except Exception as exc:
        return False, f"Failed to start ComfyUI process: {exc}"
    for _ in range(240):
        if proc.poll() is not None:
            return False, f"ComfyUI exited with return code {proc.returncode}"
        try:
            r = requests.get(f"{COMFY_BASE_URL}/system_stats", timeout=2)
            if r.status_code == 200:
                return True, None
        except Exception:
            pass
        time.sleep(1)
    return False, "ComfyUI không khởi động được: timeout 240s"

# Validate incoming job input structure
def validate_input(job: dict) -> tuple[dict | None, str | None]:
    if not isinstance(job, dict):
        return None, "Job payload must be a dict"
    job_input = job.get("input")
    if not isinstance(job_input, dict):
        return None, "Trường 'input' phải là JSON object"
    workflow = job_input.get("workflow")
    if not isinstance(workflow, dict) or not workflow:
        return None, "Trường 'workflow' phải là dict không rỗng"
    return workflow, None

# Summarize ComfyUI node errors into a readable string
def summarize_node_errors(data: dict) -> str:
    if not isinstance(data, dict):
        return str(data)
    node_errors = data.get("node_errors")
    if isinstance(node_errors, dict) and node_errors:
        parts = []
        for node_id, details in node_errors.items():
            class_type = details.get("class_type", "unknown") if isinstance(details, dict) else ""
            err_list = details.get("errors", []) if isinstance(details, dict) else []
            messages = [e.get("message", str(e)) if isinstance(e, dict) else str(e) for e in err_list]
            parts.append(f"Node {node_id} ({class_type}): {', '.join(messages) if messages else 'invalid'}")
        return "; ".join(parts)
    error = data.get("error")
    if isinstance(error, dict):
        return error.get("message", str(error))
    if error:
        return str(error)
    return "ComfyUI prompt request rejected"

# Parse ComfyUI /prompt response and validate prompt_id or errors
def parse_prompt_response(status_code: int, data: Any) -> tuple[str | None, str | None]:
    if status_code != 200:
        summary = summarize_node_errors(data) if isinstance(data, dict) else str(data)
        return None, f"ComfyUI từ chối workflow: {summary}"
    if not isinstance(data, dict):
        return None, "ComfyUI phản hồi không hợp lệ"
    if data.get("error"):
        summary = summarize_node_errors(data)
        return None, f"ComfyUI từ chối workflow: {summary}"
    node_errors = data.get("node_errors")
    if isinstance(node_errors, dict) and bool(node_errors):
        summary = summarize_node_errors(data)
        return None, f"ComfyUI từ chối workflow: {summary}"
    prompt_id = data.get("prompt_id")
    if not prompt_id:
        return None, "ComfyUI không trả về prompt_id"
    return str(prompt_id), None

# Extract output images and check for errors from ComfyUI history
def extract_images_from_history(history_data: dict, prompt_id: str) -> tuple[list[dict], str | None]:
    if not isinstance(history_data, dict):
        return [], "Invalid history format"
    item = history_data.get(prompt_id)
    if not item and prompt_id in history_data:
        item = history_data[prompt_id]
    if not isinstance(item, dict):
        item = history_data
    status_info = item.get("status", {})
    if isinstance(status_info, dict):
        if status_info.get("status_str") == "error":
            msgs = status_info.get("messages", [])
            msg_str = "; ".join(str(m) for m in msgs) if msgs else "execution error"
            return [], f"ComfyUI thực thi lỗi: {msg_str}"
    outputs = item.get("outputs", {})
    if not isinstance(outputs, dict):
        return [], "Không có ảnh output"
    images = []
    for node_id, node_out in outputs.items():
        if isinstance(node_out, dict):
            for img in node_out.get("images", []):
                if isinstance(img, dict) and img.get("type") == "output":
                    images.append(img)
    if not images:
        return [], "Không có ảnh output"
    return images, None

# Read width and height from PNG IHDR chunk
def get_png_dimensions(data_or_path) -> tuple[int, int]:
    try:
        if isinstance(data_or_path, (str, Path)):
            with open(data_or_path, "rb") as f:
                header = f.read(24)
        else:
            header = bytes(data_or_path[:24])
        if len(header) >= 24 and header[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", header[16:24])
            return int(w), int(h)
    except Exception:
        pass
    try:
        from PIL import Image
        with Image.open(data_or_path) as img:
            return int(img.width), int(img.height)
    except Exception:
        pass
    return 1024, 1536

# Build object keys and filenames according to output contract
def build_r2_keys(job_id: str, index: int, prefix: str, mask_status: str, width: int, height: int) -> dict:
    return {
        "index": index,
        "filename": f"{job_id}_{index}.png",
        "key": f"{prefix}/{job_id}/{index}.png",
        "masked_key": f"{prefix}/{job_id}/{index}.masked.png" if mask_status != "failed" else None,
        "mask_status": mask_status,
        "width": width,
        "height": height,
    }

# Run standalone censor CLI subprocess on image
def run_censor_subprocess(input_path: Path, output_path: Path, timeout: int = 120) -> tuple[str, str | None]:
    py_exec = CENSOR_VENV_PY if os.path.exists(CENSOR_VENV_PY) else sys.executable
    cli_path = CENSOR_CLI_PATH if os.path.exists(CENSOR_CLI_PATH) else str(Path(__file__).parent / "censor_cli.py")
    cmd = [py_exec, cli_path, str(input_path), str(output_path)]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except Exception as exc:
        return "failed", f"Subprocess exception: {exc}"
    if res.returncode != 0:
        return "failed", f"Subprocess exit code {res.returncode}: {res.stderr.strip() or res.stdout.strip()}"
    try:
        parsed = json.loads(res.stdout.strip().splitlines()[-1])
        status = parsed.get("status")
        if status in ("censored", "clean"):
            return status, None
        return "failed", parsed.get("error", "Unknown status")
    except Exception as exc:
        return "failed", f"Failed to parse censor output: {exc}"

# Create S3 client for Cloudflare R2 storage
def get_r2_client() -> tuple[Any, str | None, str | None]:
    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_BUCKET")
    missing = [k for k, v in [
        ("R2_ACCOUNT_ID", account_id),
        ("R2_ACCESS_KEY_ID", access_key),
        ("R2_SECRET_ACCESS_KEY", secret_key),
        ("R2_BUCKET", bucket),
    ] if not v]
    if missing:
        return None, None, f"Thiếu biến môi trường R2: {', '.join(missing)}"
    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )
    return client, bucket, None

# Remove temporary job directory and generated images
def cleanup_job_files(job_id: str, filenames: list[str]) -> None:
    tmp_dir = TEMP_BASE / job_id
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)
    comfy_out = COMFY_DIR / "output"
    if comfy_out.exists():
        for fn in filenames:
            (comfy_out / fn).unlink(missing_ok=True)

# Main handler for RunPod serverless job execution
def handler(job: dict) -> dict:
    try:
        if not COMFY_READY:
            return {"error": f"ComfyUI không khởi động được: {COMFY_ERROR or 'Chưa sẵn sàng'}"}
        workflow, err = validate_input(job)
        if err:
            return {"error": err}
        job_id = str(job.get("id") or uuid.uuid4())
        prefix = os.environ.get("RUNPOD_OUTPUT_PREFIX", DEFAULT_PREFIX)
        timeout_s = int(os.environ.get("COMFY_JOB_TIMEOUT_S", DEFAULT_TIMEOUT_S))
        s3_client, bucket, r2_err = get_r2_client()
        if r2_err:
            return {"error": r2_err}
        client_id = str(uuid.uuid4())
        try:
            prompt_resp = requests.post(
                f"{COMFY_BASE_URL}/prompt",
                json={"prompt": workflow, "client_id": client_id},
                timeout=30,
            )
        except Exception as exc:
            return {"error": f"Không thể gửi prompt tới ComfyUI: {exc}"}
        try:
            prompt_data = prompt_resp.json()
        except Exception:
            return {"error": f"ComfyUI phản hồi không hợp lệ (HTTP {prompt_resp.status_code})"}
        prompt_id, prompt_err = parse_prompt_response(prompt_resp.status_code, prompt_data)
        if prompt_err:
            return {"error": prompt_err}
        start_time = time.time()
        completed_images = []
        while time.time() - start_time < timeout_s:
            try:
                hist_resp = requests.get(f"{COMFY_BASE_URL}/history/{prompt_id}", timeout=10)
                if hist_resp.status_code == 200:
                    hist_data = hist_resp.json()
                    if prompt_id in hist_data:
                        extracted, hist_err = extract_images_from_history(hist_data, prompt_id)
                        if hist_err:
                            return {"error": hist_err}
                        completed_images = extracted
                        break
            except Exception:
                pass
            time.sleep(1)
        if not completed_images:
            return {"error": f"Quá thời gian chờ ComfyUI sinh ảnh ({timeout_s}s)"}
        job_tmp = TEMP_BASE / job_id
        job_tmp.mkdir(parents=True, exist_ok=True)
        result_images = []
        raw_filenames = []
        for idx, img_info in enumerate(completed_images):
            raw_fn = img_info.get("filename", "")
            subfolder = img_info.get("subfolder", "")
            img_type = img_info.get("type", "output")
            raw_filenames.append(raw_fn)
            try:
                view_resp = requests.get(
                    f"{COMFY_BASE_URL}/view",
                    params={"filename": raw_fn, "subfolder": subfolder, "type": img_type},
                    timeout=60,
                )
                if view_resp.status_code != 200:
                    return {"error": f"Không tải được ảnh {raw_fn} từ ComfyUI (HTTP {view_resp.status_code})"}
            except Exception as exc:
                return {"error": f"Lỗi tải ảnh {raw_fn}: {exc}"}
            orig_path = job_tmp / f"{idx}.png"
            masked_path = job_tmp / f"{idx}.masked.png"
            orig_path.write_bytes(view_resp.content)
            width, height = get_png_dimensions(orig_path)
            mask_status, _ = run_censor_subprocess(orig_path, masked_path, timeout=120)
            img_contract = build_r2_keys(job_id, idx, prefix, mask_status, width, height)
            try:
                s3_client.upload_file(
                    str(orig_path),
                    bucket,
                    img_contract["key"],
                    ExtraArgs={"ContentType": "image/png"},
                )
                if mask_status != "failed" and masked_path.exists():
                    s3_client.upload_file(
                        str(masked_path),
                        bucket,
                        img_contract["masked_key"],
                        ExtraArgs={"ContentType": "image/png"},
                    )
            except Exception as exc:
                return {"error": f"Lỗi upload R2: {exc}"}
            result_images.append(img_contract)
        cleanup_job_files(job_id, raw_filenames)
        return {"images": result_images}
    except Exception as exc:
        return {"error": f"Lỗi không xác định: {exc}"}

# Module-level boot check for ComfyUI
COMFY_READY = False
COMFY_ERROR = None
if not os.environ.get("PYTEST_CURRENT_TEST") and os.environ.get("DISABLE_COMFY_BOOT") != "1":
    COMFY_READY, COMFY_ERROR = boot_comfyui()

# Start RunPod serverless loop when executed directly
if __name__ == "__main__":
    if runpod is not None:
        runpod.serverless.start({"handler": handler})
    else:
        print("RunPod SDK is not installed; running in direct test mode.")

import os
from pathlib import Path
import struct
import sys
from unittest.mock import MagicMock, patch
import pytest

# Ensure parent directory is on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from handler import (
    build_r2_keys,
    extract_images_from_history,
    get_png_dimensions,
    handler,
    summarize_node_errors,
    validate_input,
)

# Test valid workflow input validation
def test_validate_input_valid():
    job = {"input": {"workflow": {"1": {"class_type": "KSampler", "inputs": {}}}}}
    wf, err = validate_input(job)
    assert err is None
    assert wf == {"1": {"class_type": "KSampler", "inputs": {}}}

# Test missing input field validation
def test_validate_input_missing_input():
    wf, err = validate_input({})
    assert wf is None
    assert "input" in err

# Test empty workflow dictionary validation
def test_validate_input_empty_workflow():
    wf, err = validate_input({"input": {"workflow": {}}})
    assert wf is None
    assert "workflow" in err

# Test invalid workflow data type validation
def test_validate_input_invalid_types():
    wf, err = validate_input("not-a-dict")
    assert wf is None
    wf, err = validate_input({"input": {"workflow": "not-a-dict"}})
    assert wf is None

# Test summarizing node errors from ComfyUI response
def test_summarize_node_errors():
    err_data = {
        "node_errors": {
            "4": {
                "class_type": "CLIPTextEncode",
                "errors": [{"message": "Missing clip conditioning", "details": "clip required"}],
            }
        }
    }
    summary = summarize_node_errors(err_data)
    assert "Node 4" in summary
    assert "CLIPTextEncode" in summary
    assert "Missing clip conditioning" in summary

# Test summarizing generic error messages
def test_summarize_generic_error():
    summary = summarize_node_errors({"error": "Prompt syntax error"})
    assert summary == "Prompt syntax error"

# Test extracting output images from valid ComfyUI history
def test_extract_images_from_history_success():
    history_data = {
        "p-123": {
            "status": {"status_str": "success", "completed": True, "messages": []},
            "outputs": {
                "9": {
                    "images": [
                        {"filename": "out_001.png", "subfolder": "", "type": "output"},
                        {"filename": "temp_preview.png", "subfolder": "", "type": "temp"},
                    ]
                }
            },
        }
    }
    images, err = extract_images_from_history(history_data, "p-123")
    assert err is None
    assert len(images) == 1
    assert images[0]["filename"] == "out_001.png"

# Test extracting images when ComfyUI reports execution error
def test_extract_images_from_history_error():
    history_data = {
        "p-123": {
            "status": {
                "status_str": "error",
                "completed": False,
                "messages": ["OutOfMemoryError: CUDA out of memory"],
            },
            "outputs": {},
        }
    }
    images, err = extract_images_from_history(history_data, "p-123")
    assert len(images) == 0
    assert "ComfyUI thực thi lỗi" in err
    assert "CUDA out of memory" in err

# Test extracting images when execution completed with zero images
def test_extract_images_from_history_zero_images():
    history_data = {
        "p-123": {
            "status": {"status_str": "success", "completed": True},
            "outputs": {"9": {"images": []}},
        }
    }
    images, err = extract_images_from_history(history_data, "p-123")
    assert len(images) == 0
    assert err == "Không có ảnh output"

# Test reading PNG dimensions from valid IHDR header
def test_get_png_dimensions_valid_header():
    png_sig = b"\x89PNG\r\n\x1a\n"
    ihdr_len = struct.pack(">I", 13)
    ihdr_type = b"IHDR"
    dimensions = struct.pack(">II", 1024, 1536)
    dummy_header = png_sig + ihdr_len + ihdr_type + dimensions
    w, h = get_png_dimensions(dummy_header)
    assert w == 1024
    assert h == 1536

# Test fallback dimensions for non-PNG content
def test_get_png_dimensions_fallback():
    w, h = get_png_dimensions(b"non-png-data")
    assert isinstance(w, int)
    assert isinstance(h, int)

# Test building R2 keys for censored, clean, and failed mask statuses
def test_build_r2_keys():
    censored = build_r2_keys("job123", 0, "runpod-out", "censored", 1024, 1536)
    assert censored["filename"] == "job123_0.png"
    assert censored["key"] == "runpod-out/job123/0.png"
    assert censored["masked_key"] == "runpod-out/job123/0.masked.png"
    assert censored["mask_status"] == "censored"
    assert censored["width"] == 1024
    assert censored["height"] == 1536

    clean = build_r2_keys("job123", 1, "custom-prefix", "clean", 800, 600)
    assert clean["key"] == "custom-prefix/job123/1.png"
    assert clean["masked_key"] == "custom-prefix/job123/1.masked.png"
    assert clean["mask_status"] == "clean"

    failed = build_r2_keys("job123", 0, "runpod-out", "failed", 1024, 1536)
    assert failed["masked_key"] is None
    assert failed["mask_status"] == "failed"

# Test handler reporting missing R2 environment variables
def test_handler_missing_r2_env(monkeypatch):
    import handler as h_mod
    monkeypatch.setattr(h_mod, "COMFY_READY", True)
    monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.delenv("R2_BUCKET", raising=False)
    res = h_mod.handler({"id": "j-1", "input": {"workflow": {"1": {"class_type": "KSampler"}}}})
    assert "error" in res
    assert "Thiếu biến môi trường R2" in res["error"]

# Test handler full mocked workflow execution
def test_handler_mocked_success(monkeypatch):
    import handler as h_mod
    monkeypatch.setattr(h_mod, "COMFY_READY", True)
    monkeypatch.setenv("R2_ACCOUNT_ID", "mock-account")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "mock-access")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "mock-secret")
    monkeypatch.setenv("R2_BUCKET", "mock-bucket")
    png_sig = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", 1024, 1536)

    def mock_post(url, json=None, timeout=None):
        m = MagicMock()
        m.status_code = 200
        m.json.return_value = {"prompt_id": "mock-prompt-1"}
        return m

    def mock_get(url, params=None, timeout=None):
        m = MagicMock()
        m.status_code = 200
        if "/history/" in url:
            m.json.return_value = {
                "mock-prompt-1": {
                    "status": {"status_str": "success", "completed": True},
                    "outputs": {"9": {"images": [{"filename": "out_0.png", "subfolder": "", "type": "output"}]}},
                }
            }
        elif "/view" in url:
            m.content = png_sig + b"\x00" * 100
        return m

    mock_s3 = MagicMock()
    mock_s3.upload_file.return_value = None

    monkeypatch.setattr("requests.post", mock_post)
    monkeypatch.setattr("requests.get", mock_get)
    monkeypatch.setattr(h_mod, "get_r2_client", lambda: (mock_s3, "mock-bucket", None))
    monkeypatch.setattr(h_mod, "run_censor_subprocess", lambda in_p, out_p, timeout=120: ("censored", None))

    job_payload = {
        "id": "runpod_job_test",
        "input": {"workflow": {"1": {"class_type": "KSampler"}}},
    }
    result = h_mod.handler(job_payload)
    assert "error" not in result
    assert "images" in result
    images = result["images"]
    assert len(images) == 1
    img = images[0]
    assert img["index"] == 0
    assert img["filename"] == "runpod_job_test_0.png"
    assert img["key"] == "runpod-out/runpod_job_test/0.png"
    assert img["masked_key"] == "runpod-out/runpod_job_test/0.masked.png"
    assert img["mask_status"] == "censored"
    assert img["width"] == 1024
    assert img["height"] == 1536

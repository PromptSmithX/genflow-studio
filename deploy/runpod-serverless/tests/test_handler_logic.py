import os
from pathlib import Path
import struct
import sys
from unittest.mock import MagicMock, patch
import pytest

# Ensure parent directory is on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from handler import (
    TEMP_BASE,
    build_r2_keys,
    cleanup_job_files,
    extract_images_from_history,
    get_png_dimensions,
    handler,
    parse_prompt_response,
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

# Test parse_prompt_response with real ComfyUI success format including empty node_errors
def test_parse_prompt_response_success_empty_node_errors():
    data = {"prompt_id": "p1", "number": 0, "node_errors": {}}
    pid, err = parse_prompt_response(200, data)
    assert pid == "p1"
    assert err is None

# Test parse_prompt_response with 400 and non-empty node_errors
def test_parse_prompt_response_error_with_node_errors():
    data = {"node_errors": {"7": {"class_type": "KSampler", "errors": [{"message": "Invalid seed"}]}}}
    pid, err = parse_prompt_response(400, data)
    assert pid is None
    assert "Node 7" in err
    assert "Invalid seed" in err

# Test parse_prompt_response with 200 but missing prompt_id
def test_parse_prompt_response_missing_prompt_id():
    pid, err = parse_prompt_response(200, {"number": 0, "node_errors": {}})
    assert pid is None
    assert "prompt_id" in err

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
        m.json.return_value = {"prompt_id": "mock-prompt-1", "number": 0, "node_errors": {}}
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

# Test cleanup_job_files removes subfolder files and temp directory
def test_cleanup_job_files_subfolder(monkeypatch):
    import handler as h_mod
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        base = Path(td)
        monkeypatch.setattr(h_mod, "TEMP_BASE", base / "temp_base")
        monkeypatch.setattr(h_mod, "COMFY_DIR", base / "comfy")
        job_tmp = h_mod.TEMP_BASE / "job_clean_test"
        job_tmp.mkdir(parents=True, exist_ok=True)
        (job_tmp / "0.png").write_text("dummy")
        comfy_out = h_mod.COMFY_DIR / "output"
        sub_dir = comfy_out / "sub1"
        sub_dir.mkdir(parents=True, exist_ok=True)
        out_file = sub_dir / "gen_001.png"
        out_file.write_text("comfy_image")

        assert job_tmp.exists()
        assert out_file.exists()
        cleanup_job_files("job_clean_test", [{"filename": "gen_001.png", "subfolder": "sub1"}])
        assert not job_tmp.exists()
        assert not out_file.exists()

# Test handler cleans up temp directory even when R2 upload fails
def test_handler_cleanup_on_upload_error(monkeypatch):
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
        m.json.return_value = {"prompt_id": "mock-p-err", "number": 0, "node_errors": {}}
        return m

    def mock_get(url, params=None, timeout=None):
        m = MagicMock()
        m.status_code = 200
        if "/history/" in url:
            m.json.return_value = {
                "mock-p-err": {
                    "status": {"status_str": "success", "completed": True},
                    "outputs": {"9": {"images": [{"filename": "out_0.png", "subfolder": "", "type": "output"}]}},
                }
            }
        elif "/view" in url:
            m.content = png_sig + b"\x00" * 100
        return m

    mock_s3 = MagicMock()
    mock_s3.upload_file.side_effect = RuntimeError("S3 upload failed: bucket permission denied")

    monkeypatch.setattr("requests.post", mock_post)
    monkeypatch.setattr("requests.get", mock_get)
    monkeypatch.setattr(h_mod, "get_r2_client", lambda: (mock_s3, "mock-bucket", None))
    monkeypatch.setattr(h_mod, "run_censor_subprocess", lambda in_p, out_p, timeout=120: ("clean", None))

    job_id = "test_cleanup_fail_job"
    job_payload = {
        "id": job_id,
        "input": {"workflow": {"1": {"class_type": "KSampler"}}},
    }
    result = h_mod.handler(job_payload)
    assert "error" in result
    assert "Lỗi upload R2" in result["error"]
    job_tmp = h_mod.TEMP_BASE / job_id
    assert not job_tmp.exists()

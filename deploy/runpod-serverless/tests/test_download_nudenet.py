from pathlib import Path
import sys
import tempfile
from unittest.mock import MagicMock, patch
import pytest

# Ensure parent directory is on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from download_nudenet import MIN_BYTES, download

# Test first mirror succeeds with valid model size
def test_download_first_mirror_success():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td) / "640m.onnx"
        mirrors = ["https://mirror1/640m.onnx", "https://mirror2/640m.onnx"]

        def fake_retrieve(url, path):
            with open(path, "wb") as f:
                f.truncate(100 * 1024 * 1024)

        with patch("urllib.request.urlretrieve", side_effect=fake_retrieve) as mock_retrieve:
            ok = download(mirrors, dest)
            assert ok is True
            assert dest.exists()
            assert dest.stat().st_size == 100 * 1024 * 1024
            assert mock_retrieve.call_count == 1
            assert mock_retrieve.call_args[0][0] == mirrors[0]

# Test first mirror produces invalid size and fallback mirror succeeds
def test_download_fallback_mirror_success():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td) / "640m.onnx"
        mirrors = ["https://mirror1/640m.onnx", "https://mirror2/640m.onnx"]

        def fake_retrieve(url, path):
            with open(path, "wb") as f:
                if url == mirrors[0]:
                    f.write(b"LFS pointer 15b")
                else:
                    f.truncate(95 * 1024 * 1024)

        with patch("urllib.request.urlretrieve", side_effect=fake_retrieve) as mock_retrieve:
            ok = download(mirrors, dest)
            assert ok is True
            assert dest.exists()
            assert dest.stat().st_size == 95 * 1024 * 1024
            assert mock_retrieve.call_count == 2

# Test failure across all candidate mirrors
def test_download_all_mirrors_fail():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td) / "640m.onnx"
        mirrors = ["https://mirror1/640m.onnx", "https://mirror2/640m.onnx"]

        def fake_retrieve(url, path):
            raise ConnectionError("Network unreachable")

        with patch("urllib.request.urlretrieve", side_effect=fake_retrieve):
            ok = download(mirrors, dest)
            assert ok is False
            assert not dest.exists()

# Test skip downloading when valid file already exists
def test_download_already_exists():
    with tempfile.TemporaryDirectory() as td:
        dest = Path(td) / "640m.onnx"
        with open(dest, "wb") as f:
            f.truncate(105 * 1024 * 1024)
        with patch("urllib.request.urlretrieve") as mock_retrieve:
            ok = download(["https://mirror1/640m.onnx"], dest)
            assert ok is True
            assert mock_retrieve.call_count == 0

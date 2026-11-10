import os
from pathlib import Path
import sys
import urllib.request

DEFAULT_MIRRORS = [
    "https://huggingface.co/ServiceStack/comfy-gateway/resolve/main/640m.onnx",
    "https://huggingface.co/spaces/xxparthparekhxx/NudeNet-FastAPI/resolve/main/640m.onnx",
]
DEFAULT_DEST = Path("/models/640m.onnx")
MIN_BYTES = 90 * 1024 * 1024
MAX_BYTES = 130 * 1024 * 1024

# Download 640m detector model from mirrors with size verification
def download(mirrors: list[str], dest: Path | str) -> bool:
    dest_path = Path(dest)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if dest_path.exists() and MIN_BYTES <= dest_path.stat().st_size <= MAX_BYTES:
        print(f"Model already present and valid at {dest_path}")
        return True
    for url in mirrors:
        print(f"Trying mirror: {url}")
        dest_path.unlink(missing_ok=True)
        try:
            urllib.request.urlretrieve(url, str(dest_path))
            if dest_path.exists() and MIN_BYTES <= dest_path.stat().st_size <= MAX_BYTES:
                print(f"Downloaded valid model: {dest_path.stat().st_size} bytes")
                return True
            actual_size = dest_path.stat().st_size if dest_path.exists() else 0
            print(f"Size out of range ({actual_size} bytes), removing...")
            dest_path.unlink(missing_ok=True)
        except Exception as exc:
            print(f"Mirror download error: {exc}")
            dest_path.unlink(missing_ok=True)
    return False

# Command-line entrypoint for downloading 640m.onnx
def main() -> None:
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DEST
    if not download(DEFAULT_MIRRORS, dest):
        print("All mirrors failed for 640m.onnx")
        sys.exit(1)

if __name__ == "__main__":
    main()

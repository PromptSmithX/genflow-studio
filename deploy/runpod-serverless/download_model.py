import hashlib
import os
import sys
from pathlib import Path
import requests

MODEL_VERSION_ID = 3112728
FILE_ID = 2996235
EXPECTED_FILENAME = "lustifyNSFWCheckpoint_v10Krea2_2996235.safetensors"
EXPECTED_SIZE = 13148974712
EXPECTED_SHA256 = "0505412ed2ac568286c4bf43f8ace93f9f5a6dd7a607f47f1912a68767e6900d"
DEFAULT_DEST = Path("/comfyui/models/diffusion_models") / EXPECTED_FILENAME
SECRET_TOKEN_PATH = Path("/run/secrets/civitai_token")

# Compute SHA-256 digest in 16MB chunks
def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(16 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

# Load CivitAI token from BuildKit secret mount
def load_civitai_token() -> str:
    if SECRET_TOKEN_PATH.exists():
        token = SECRET_TOKEN_PATH.read_text(encoding="utf-8").strip()
        if token:
            return token
    return os.environ.get("CIVITAI_TOKEN", "").strip()

# Try downloading model file from host
def try_download_host(host: str, token: str, dest_path: Path) -> tuple[bool, str]:
    part_path = dest_path.with_suffix(dest_path.suffix + ".part")
    url = f"{host}/api/download/models/{MODEL_VERSION_ID}"
    params = {"fileId": str(FILE_ID)}
    if token:
        params["token"] = token
    existing_bytes = part_path.stat().st_size if part_path.exists() else 0
    headers = {"User-Agent": "ComfyUI-Colab-LUSTIFY-Setup/1.0"}
    if existing_bytes:
        headers["Range"] = f"bytes={existing_bytes}-"
    try:
        resp = requests.get(url, params=params, headers=headers, stream=True, allow_redirects=True, timeout=(30, 300))
    except Exception as exc:
        return False, f"Connection failed: {exc}"
    if resp.status_code in (401, 403):
        resp.close()
        return False, f"HTTP {resp.status_code} Unauthorized / Forbidden"
    if resp.status_code not in (200, 206):
        resp.close()
        return False, f"HTTP {resp.status_code}"
    content_type = (resp.headers.get("Content-Type") or "").lower()
    if "text/html" in content_type or "application/json" in content_type:
        resp.close()
        return False, f"Unexpected Content-Type {content_type}"
    append_mode = existing_bytes > 0 and resp.status_code == 206
    mode = "ab" if append_mode else "wb"
    try:
        with resp, open(part_path, mode) as f:
            for chunk in resp.iter_content(chunk_size=8 * 1024 * 1024):
                if chunk:
                    f.write(chunk)
    except Exception as exc:
        return False, f"Download interrupted: {exc}"
    actual_size = part_path.stat().st_size if part_path.exists() else 0
    if actual_size != EXPECTED_SIZE:
        part_path.unlink(missing_ok=True)
        return False, f"Size mismatch: got {actual_size}, expected {EXPECTED_SIZE}"
    actual_hash = sha256_file(part_path)
    if actual_hash.lower() != EXPECTED_SHA256:
        part_path.unlink(missing_ok=True)
        return False, f"SHA-256 mismatch: got {actual_hash}, expected {EXPECTED_SHA256}"
    part_path.replace(dest_path)
    return True, "Success"

# Execute model download from primary or fallback mirror
def main() -> None:
    dest_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DEST
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if dest_path.exists() and dest_path.stat().st_size == EXPECTED_SIZE:
        if sha256_file(dest_path).lower() == EXPECTED_SHA256:
            print(f"Model already verified at {dest_path}")
            return
        dest_path.unlink()
    token = load_civitai_token()
    hosts = ["https://civitai.red", "https://civitai.com"]
    for host in hosts:
        print(f"Attempting download from {host}...")
        ok, msg = try_download_host(host, token, dest_path)
        if ok:
            print(f"Model successfully downloaded and verified to {dest_path}")
            return
        print(f"Download failed from {host}: {msg}")
    print("Failed to download LUSTIFY model from all available hosts.")
    sys.exit(1)

if __name__ == "__main__":
    main()

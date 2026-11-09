# RunPod Serverless Worker cho ComfyUI LUSTIFY & Auto-Censor

Tài liệu hướng dẫn đóng gói Docker image, triển khai và kiểm thử RunPod Serverless worker cho backend sinh ảnh của Anima Studio.

---

## 1. Tổng quan kiến trúc

Worker chạy dưới dạng container serverless trên nền tảng [RunPod Serverless](https://docs.runpod.io/serverless/overview):
- **Base image:** `pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime` (được pin tag chính thức từ Docker Hub).
- **ComfyUI:** Clone từ `https://github.com/Comfy-Org/ComfyUI.git` và pin commit cố định `fca60fe70e5b84c5c6b058263653d15cb3401e44` (Comfy-Org, ngày 2026-11-09) nhằm đảm bảo tính tái lập (reproducibility).
- **Baked-in Models:** Toàn bộ models được nướng sẵn vào image để không phụ thuộc vào Network Volume (giúp mở khóa toàn bộ Data Centers, tránh tình trạng nghẽn GPU):
  - `lustifyNSFWCheckpoint_v10Krea2_2996235.safetensors` (13,148,974,712 bytes, SHA-256: `0505412ed2ac568286c4bf43f8ace93f9f5a6dd7a607f47f1912a68767e6900d`) tải từ CivitAI qua BuildKit secret.
  - `qwen3vl_4b_fp8_scaled.safetensors` (~4.7GB, text encoder Krea2) từ HuggingFace.
  - `wan_2.1_vae.safetensors` (~220MB, VAE Wan 2.1) từ HuggingFace.
  - `640m.onnx` (~104MB, NudeNet 640m detector) từ HuggingFace mirrors.
- **Auto-censor:** Tách riêng vào virtual environment `/opt/censor-venv` (`nudenet==3.4.2`, `numpy>=1.26,<3`, `onnxruntime`, `Pillow`) tránh xung đột version numpy/torch với ComfyUI.
- **Main environment dependencies:** Pin phiên bản cụ thể cho môi trường chính (`runpod==2.1.0`, `boto3==1.43.126`, `requests==2.32.3`) đảm bảo image hoàn toàn có thể tái lập.
- **Lưu trữ Cloudflare R2:** Ảnh gốc và ảnh che luôn được upload trực tiếp lên R2 bucket theo hợp đồng key cố định, worker chỉ trả về object keys (không trả base64 qua payload API).

---

## 2. Hợp đồng Input / Output

Tài liệu RunPod Endpoint API: [docs.runpod.io/serverless/endpoints/endpoint-api](https://docs.runpod.io/serverless/endpoints/endpoint-api)

### Input Payload
```json
{
  "input": {
    "workflow": {
      "<nodeId>": {
        "class_type": "...",
        "inputs": {}
      }
    }
  }
}
```

### Output khi thành công
```json
{
  "images": [
    {
      "index": 0,
      "filename": "<runpodJobId>_0.png",
      "key": "<prefix>/<runpodJobId>/0.png",
      "masked_key": "<prefix>/<runpodJobId>/0.masked.png",
      "mask_status": "censored",
      "width": 1024,
      "height": 1536
    }
  ]
}
```
- `prefix`: Giá trị từ biến môi trường `RUNPOD_OUTPUT_PREFIX` (mặc định: `runpod-out`).
- `runpodJobId`: ID của job do RunPod cấp (`job["id"]`).
- `mask_status`: `censored` (đã che vùng nhạy cảm), `clean` (ảnh an toàn, không có vùng cần che), hoặc `failed` (lỗi khi chạy censor).
- Nếu `mask_status` là `failed`, `masked_key` sẽ có giá trị `null` và job vẫn được coi là thành công.
- `width` và `height`: Kích thước pixel đọc trực tiếp từ header PNG IHDR (nếu không đọc được từ header, trả về `null`).
- Khi có lỗi (workflow không hợp lệ, ComfyUI từ chối, timeout, upload R2 thất bại), handler trả về `{"error": "<mô tả ngắn, có node_errors nếu có>"}` để RunPod đánh dấu job là FAILED.

---

## 3. Hướng dẫn Build & Push Docker Image

Tài liệu BuildKit Secret: [docs.docker.com/build/building/secrets/](https://docs.docker.com/build/building/secrets/)

1. Chuẩn bị file `token.txt` trong thư mục `deploy/runpod-serverless/` chứa CivitAI API token (file này đã được cấu hình trong `.gitignore` và `.dockerignore`, tuyệt đối không commit vào git):
   ```bash
   echo "YOUR_CIVITAI_API_TOKEN" > deploy/runpod-serverless/token.txt
   ```

2. Build Docker image sử dụng BuildKit Secret (token không bị lưu vào image layer hay biến môi trường):
   ```bash
   DOCKER_BUILDKIT=1 docker build \
     --secret id=civitai_token,src=deploy/runpod-serverless/token.txt \
     -t <dockerhub-username>/anima-serverless:v1.0.0 \
     deploy/runpod-serverless/
   ```

3. Push image lên container registry:
   ```bash
   docker push <dockerhub-username>/anima-serverless:v1.0.0
   ```

---

## 4. Cấu hình RunPod Serverless Endpoint

Tài liệu cấu hình Endpoint RunPod: [docs.runpod.io/serverless/overview](https://docs.runpod.io/serverless/overview)

Vào trang **RunPod Console** -> **Serverless** -> **New Endpoint**:

1. **General Settings:**
   - **Endpoint Name:** `anima-serverless-worker`
   - **Container Image:** `<dockerhub-username>/anima-serverless:v1.0.0`
   - **Container Disk:** Tối thiểu `30 GB` (image chứa models nặng ~20GB).
2. **GPU & Availability:**
   - **GPU Types:** Chọn nhiều dòng GPU 24GB, 32GB, 48GB, ưu tiên theo giá rẻ trước:
     - RTX 3090 (24GB)
     - RTX 4090 (24GB)
     - RTX A5000 (24GB)
     - RTX 6000 Ada / A40 / L40 (48GB)
   - **Data Centers:** Chọn **All data centers** (tất cả 34 DC) để đảm bảo luôn có GPU khả dụng.
   - **Network Volume:** **KHÔNG** gắn Network Volume (để tránh bị khóa vào 1 DC duy nhất).
3. **Scaling & Worker Policy:**
   - **Min Workers:** `0` (tự tắt khi không có request để tiết kiệm chi phí).
   - **Max Workers:** `1` đến `3` tùy nhu cầu song song.
   - **Idle Timeout:** `60` đến `300` giây (giữ worker hoạt động thêm một khoảng thời gian chờ batch tiếp theo).
   - **FlashBoot:** **Bật** (tăng tốc độ khởi động lại worker).
4. **Environment Variables:**
   - `R2_ACCOUNT_ID`: Cloudflare Account ID.
   - `R2_ACCESS_KEY_ID`: Cloudflare R2 Access Key ID.
   - `R2_SECRET_ACCESS_KEY`: Cloudflare R2 Secret Access Key.
   - `R2_BUCKET`: Tên bucket R2.
   - `RUNPOD_OUTPUT_PREFIX`: (Tùy chọn) `runpod-out`.
   - `COMFY_JOB_TIMEOUT_S`: (Tùy chọn) `600`.
   - `CENSOR_MODEL_PATH`: (Tùy chọn) `/models/640m.onnx`.
   - `CENSOR_INFERENCE_RESOLUTION`: (Tùy chọn) `640`.
   *(Khuyến nghị: Tạo Cloudflare R2 API Token riêng với quyền Object Read & Write chỉ trên bucket này).*

---

## 5. Kiểm thử Endpoint (RunPod API & Local)

Tài liệu RunPod Local Testing: [docs.runpod.io/serverless/workers/development/local-testing](https://docs.runpod.io/serverless/workers/development/local-testing)
Tài liệu RunPod Job Status: [docs.runpod.io/serverless/endpoints/job-status](https://docs.runpod.io/serverless/endpoints/job-status)

### 5.1 Kiểm tra trên RunPod Cloud
Đặt biến môi trường terminal:
```bash
export RUNPOD_API_KEY="your-runpod-api-key"
export ENDPOINT_ID="your-endpoint-id"
```

1. **Kiểm tra trạng thái Endpoint:**
   ```bash
   curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
     "https://api.runpod.ai/v2/$ENDPOINT_ID/health"
   ```

2. **Gửi job sinh ảnh (Async `/run`):**
   ```bash
   curl -X POST \
     -H "Authorization: Bearer $RUNPOD_API_KEY" \
     -H "Content-Type: application/json" \
     -d @deploy/runpod-serverless/test_input.json \
     "https://api.runpod.ai/v2/$ENDPOINT_ID/run"
   ```
   Kết quả trả về `{"id": "<jobId>", "status": "IN_QUEUE"}`.

3. **Kiểm tra tiến độ job:**
   ```bash
   curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
     "https://api.runpod.ai/v2/$ENDPOINT_ID/status/<jobId>"
   ```
   Khi hoàn thành, `status` là `COMPLETED`. Kiểm tra 2 file ảnh đã được upload lên Cloudflare R2 theo key `runpod-out/<jobId>/0.png` và `runpod-out/<jobId>/0.masked.png`.

### 5.2 Kiểm tra Local bằng RunPod SDK
Theo tài liệu RunPod SDK, có 3 cách kiểm tra cục bộ:

1. **Sử dụng flag `--test_input`:**
   ```bash
   python handler.py --test_input '{"input": {"workflow": {"1": {"class_type": "KSampler"}}}}'
   ```
2. **Sử dụng file `test_input.json`:**
   Đặt file `test_input.json` cùng thư mục với `handler.py` và chạy:
   ```bash
   python handler.py
   ```
   RunPod SDK sẽ tự động phát hiện `test_input.json` và chạy job kiểm thử.
3. **Mô phỏng máy chủ HTTP cục bộ với `--rp_serve_api`:**
   ```bash
   python handler.py --rp_serve_api
   ```
   Gửi HTTP request tới `http://localhost:8000/runsync` để test luồng HTTP.

---

## 6. Ghi chú Bảo trì & Nâng cấp

- **ComfyUI Commit Pin:** Image hiện đang pin commit `fca60fe70e5b84c5c6b058263653d15cb3401e44`. Để nâng cấp ComfyUI:
  1. Kiểm tra commit mới nhất: `git ls-remote https://github.com/Comfy-Org/ComfyUI.git HEAD`.
  2. Cập nhật commit SHA trong `deploy/runpod-serverless/Dockerfile`.
  3. Kiểm tra tính tương thích của các custom node Krea2/Qwen3VL/Wan2.1 với version mới.
- **Quản lý dung lượng đĩa:** Sau mỗi job sinh ảnh thành công hoặc thất bại, khối `try/finally` trong handler sẽ luôn tự động dọn dẹp thư mục tạm `/tmp/<jobId>` và toàn bộ ảnh sinh ra trong `/comfyui/output/` (bao gồm cả thư mục con nếu có `subfolder`) nhằm bảo vệ container disk không bị đầy khi worker hoạt động lâu dài.
- **Ghi log lỗi censor:** Khi tiến trình che ảnh gặp sự cố (`mask_status: failed`), chi tiết lỗi sẽ được log rõ ràng ra stdout của worker theo định dạng `[censor] job=<id> index=<i> failed: <msg>` để người vận hành dễ dàng chẩn đoán trên RunPod Console.

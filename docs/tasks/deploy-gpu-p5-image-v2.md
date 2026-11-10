# Task P5: Worker image v2 — PyTorch CUDA 13 + stage tải model riêng

> **Dành cho agent thực thi.** Làm trên branch `feature/deploy_gpu` (worktree hiện tại). Ngữ cảnh: worker P1 (`deploy/runpod-serverless/`) đã chạy thật trên RunPod với tag `v1`. Mâu thuẫn → chọn phương án an toàn, ghi lý do vào "Ghi chú của người thực thi". **Chỉ sửa trong `deploy/runpod-serverless/`** và file spec này. Không đổi `handler.py`, `censor_*.py`, `download_*.py` trừ khi bắt buộc (nếu bắt buộc, giải thích trong Ghi chú). Không đổi commit ComfyUI `fca60fe70e5b84c5c6b058263653d15cb3401e44`.

## 0. Quy tắc bắt buộc
1. Không secret trong code/image. Token CivitAI chỉ qua BuildKit secret `civitai_token` (`RUN --mount=type=secret,id=civitai_token`), không ARG/ENV/COPY.
2. Comment Dockerfile ngắn (1 dòng). README tiếng Việt.
3. Commit nhỏ: (a) spec này → (b) Dockerfile → (c) README → (d) ghi chú. Bỏ qua file `0.26.0` ở gốc repo.
4. **Không chạy build đầy đủ** (tải ~18GB). Chỉ được chạy: `docker build --check deploy/runpod-serverless` (kiểm Dockerfile, không build), `python -m py_compile deploy/runpod-serverless/*.py`, `python -m pytest deploy/runpod-serverless/tests -q`.

## 1. Lý do (bằng chứng từ log worker v1 thật)
- Base hiện tại `pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime`. Log ComfyUI 0.44: `WARNING: You need pytorch with cu130 or higher to use optimized CUDA operations.`; `comfy_kitchen backend cuda: {'available': True, 'disabled': True ...}`, `triton ... 'disabled': True` → model INT8 chạy đường `eager` (`model weight dtype torch.bfloat16, manual cast`), ~4.4 s/it, ~36s/ảnh.
- GPU worker: `NVIDIA RTX PRO 6000 Blackwell ... MIG 1g.24gb`, driver báo `CUDA 13.2`.
- Reviewer đã verify trên Docker Hub (2026-11-10): `pytorch/pytorch:2.14.1-cuda13.0-cudnn9-runtime` và `python:3.11.18-slim-bookworm` tồn tại.
- Đổi `FROM` làm mất cache mọi layer sau → phải tải lại ~18GB model. Tách tải model sang stage có base nhỏ, cố định để các lần đổi PyTorch/ComfyUI sau không tải lại.

## 6. Thiết kế `deploy/runpod-serverless/Dockerfile` (2 stage)

### Stage 1 `models`
```dockerfile
FROM python:3.11.18-slim-bookworm AS models
```
- `apt-get install -y --no-install-recommends wget ca-certificates` (dọn `/var/lib/apt/lists/*`), `pip install --no-cache-dir requests==2.34.2`.
- Tải vào `/out` (giữ nguyên URL + kiểm size tối thiểu như Dockerfile hiện tại):
  - `/out/comfyui/models/text_encoders/qwen3vl_4b_fp8_scaled.safetensors` (≥ 4,700,000,000 bytes)
  - `/out/comfyui/models/vae/wan_2.1_vae.safetensors` (≥ 220,000,000 bytes)
  - `/out/models/640m.onnx` qua `download_nudenet.py` (truyền dest qua argv — script đã hỗ trợ `sys.argv[1]`)
  - `/out/comfyui/models/diffusion_models/lustifyNSFWCheckpoint_v10Krea2_2996235.safetensors` qua `RUN --mount=type=secret,id=civitai_token python /tmp/download_model.py <dest>` (script đã hỗ trợ `sys.argv[1]`; giữ verify size + SHA-256).
- Mỗi model 1 `RUN` riêng (cache độc lập; tải lỗi 1 cái không mất cái khác).

### Stage 2 (final)
```dockerfile
FROM pytorch/pytorch:2.14.1-cuda13.0-cudnn9-runtime
```
Thứ tự layer (bước phụ thuộc base trước, model sau pip, code cuối):
1. `ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1`; apt như hiện tại (`git wget ca-certificates libglib2.0-0 libgomp1`).
2. Clone ComfyUI + checkout `fca60fe...`; `pip install --no-cache-dir -r /comfyui/requirements.txt`.
3. **Guard CUDA** (fail build nếu pip lỡ thay torch bằng bản CUDA 12):
   `RUN python -c "import torch,sys; print(torch.__version__, torch.version.cuda); sys.exit(0 if (torch.version.cuda or '').startswith('13') else 1)"`
4. Censor venv `/opt/censor-venv` — giữ nguyên dòng hiện tại.
5. `pip install --no-cache-dir runpod==2.1.0 boto3==1.43.126 requests==2.34.2`.
6. `COPY --from=models /out/comfyui/models/ /comfyui/models/` và `COPY --from=models /out/models/640m.onnx /models/640m.onnx`. Đảm bảo không ghi đè/xóa các thư mục model mặc định khác của ComfyUI (copy merge vào cây có sẵn là được).
7. `COPY censor_lib.py censor_cli.py handler.py` vào `/`; `WORKDIR /`; `CMD ["python", "-u", "/handler.py"]`.
- Xóa các bước tải model cũ khỏi stage final. `download_model.py`/`download_nudenet.py` chỉ dùng trong stage `models`.
- `.dockerignore` giữ loại `token.txt`; kiểm tra build context vẫn đủ file cần cho cả 2 stage.

## 6.2 README (`deploy/runpod-serverless/README.md`)
- Cập nhật mục kiến trúc: base `pytorch/pytorch:2.14.1-cuda13.0-cudnn9-runtime`, lý do (bật kernel tối ưu ComfyUI cho INT8 trên GPU Blackwell), stage `models` giữ cache model.
- Lệnh build tag **`v2`**: `docker build --secret id=civitai_token,src=deploy/runpod-serverless/token.txt -t <user>/anima-serverless:v2 deploy/runpod-serverless`.
- Smoke test trước khi push (thêm kiểm CUDA):
  - `docker run --rm --entrypoint python <img> -c "import torch; print(torch.__version__, torch.version.cuda)"` → `2.14.1... 13.0`
  - censor venv import, liệt kê model (như hiện tại).
- Mục **Nâng cấp / Rollback**: đổi image endpoint sang `:v2` (Manage → Edit endpoint, Endpoint ID không đổi); lỗi → đổi lại `:v1`. Cách kiểm log worker: không còn dòng cảnh báo `cu130`, backend `cuda`/`triton` không còn `disabled: True`, so `s/it` và `Prompt executed in` với v1 (~4.4 s/it, ~36s).
- Lưu ý dung lượng: xóa image cũ trên máy trước khi build (`docker image rm ...`, `docker builder prune -a -f`).
- Sửa đúng chỗ, không đổi encoding file (UTF-8, giữ nguyên tiếng Việt).

## 7. Kiểm tra
- `docker build --check deploy/runpod-serverless` không lỗi (nếu Docker engine không chạy được trên máy agent, ghi rõ trong Ghi chú).
- `python -m py_compile deploy/runpod-serverless/*.py` và `python -m pytest deploy/runpod-serverless/tests -q` xanh.

## 8. Definition of Done
- [x] Dockerfile 2 stage đúng mục 6; base pin đúng 2 tag đã nêu; guard CUDA có mặt.
- [x] Token CivitAI chỉ qua secret mount, trong stage `models`; không secret nào khác.
- [x] ComfyUI vẫn pin `fca60fe...`; pip pins giữ nguyên.
- [x] README cập nhật mục 6.2, không vỡ encoding.
- [x] Không file nào ngoài `deploy/runpod-serverless/` và spec này bị sửa.
- [x] Kiểm tra mục 7 xanh; điền "Ghi chú của người thực thi"; `worker_done` liệt kê commit.

## Ghi chú của người thực thi

### 1. Kiến trúc Dockerfile 2 stage
- **Stage 1 (`models`)**: Sử dụng base `python:3.11.18-slim-bookworm` gọn nhẹ. Cài đặt `wget`, `ca-certificates` và `requests==2.34.2`. Tải toàn bộ 4 models vào `/out`:
  - `qwen3vl_4b_fp8_scaled.safetensors` (≥ 4,700,000,000 bytes) vào `/out/comfyui/models/text_encoders/` qua `wget`.
  - `wan_2.1_vae.safetensors` (≥ 220,000,000 bytes) vào `/out/comfyui/models/vae/` qua `wget`.
  - `640m.onnx` vào `/out/models/` qua `download_nudenet.py /out/models/640m.onnx`.
  - `lustifyNSFWCheckpoint_v10Krea2_2996235.safetensors` vào `/out/comfyui/models/diffusion_models/` qua `download_model.py` với secret mount BuildKit `civitai_token`.
  - Mỗi model được tải trong 1 chỉ thị `RUN` riêng biệt để bảo toàn cache độc lập.
- **Stage 2 (`final`)**: Sử dụng base `pytorch/pytorch:2.14.1-cuda13.0-cudnn9-runtime`.
  - Cài đặt các gói hệ thống cần thiết (`git`, `wget`, `ca-certificates`, `libglib2.0-0`, `libgomp1`).
  - Clone ComfyUI và pin commit `fca60fe70e5b84c5c6b058263653d15cb3401e44`, cài đặt `requirements.txt`.
  - Đặt guard CUDA kiểm tra runtime PyTorch hỗ trợ CUDA 13.x: `RUN python -c "import torch,sys; print(torch.__version__, torch.version.cuda); sys.exit(0 if (torch.version.cuda or '').startswith('13') else 1)"`.
  - Thiết lập virtualenv riêng `/opt/censor-venv` cho NudeNet và ONNX Runtime.
  - Cài đặt dependencies chính (`runpod==2.1.0`, `boto3==1.43.126`, `requests==2.34.2`).
  - Copy toàn bộ model từ stage `models` sang (`/comfyui/models/` và `/models/640m.onnx`), merge sạch sẽ mà không làm mất cấu trúc thư mục của ComfyUI.
  - Copy `censor_lib.py`, `censor_cli.py`, `handler.py` vào `/`.

### 2. Xử lý mã nguồn Python
- Không cần sửa đổi bất kỳ file script nào (`handler.py`, `censor_*.py`, `download_*.py`) do `download_model.py` và `download_nudenet.py` đã hỗ trợ sẵn nhận đường dẫn đích qua tham số dòng lệnh `sys.argv[1]`.
- Không có bất kỳ token/secret nào bị lưu trong image layer hay commit code. File `token.txt` tiếp tục được bảo vệ bởi `.dockerignore` và `.gitignore`.

### 3. Cập nhật README
- Bổ sung thông tin kiến trúc base PyTorch 2.14.1 CUDA 13.0, giải thích cơ chế kích hoạt backend `comfy_kitchen` và `triton` cho GPU Blackwell NVIDIA RTX PRO 6000.
- Cập nhật lệnh build tag `v2`, hướng dẫn dọn dẹp bộ nhớ đệm đĩa (`docker builder prune -a -f`).
- Bổ sung smoke test kiểm tra phiên bản PyTorch CUDA 13.0, censor venv và kiểm tra model.
- Thêm mục 6 riêng hướng dẫn Nâng cấp endpoint lên `:v2`, Rollback về `:v1` và cách theo dõi log worker sau khi deploy.
- File README giữ nguyên chuẩn mã hóa UTF-8 tiếng Việt.

### 4. Kết quả kiểm tra
- `docker build --check deploy/runpod-serverless`: Thực thi thành công, build context và cú pháp Dockerfile 2-stage hợp lệ, Docker load metadata thành công cả 2 base image mà không có cảnh báo nào (`Check complete, no warnings found.`).
- `python -m py_compile deploy/runpod-serverless/*.py`: Tất cả các file Python biên dịch thành công 100%.
- `python -m pytest deploy/runpod-serverless/tests -q`: Toàn bộ 23/23 tests pass.

### 5. Lịch sử commit thực hiện theo spec
- `539c8b9`: `docs: add task p5 image v2 spec`
- `9537f24`: `feat(deploy): convert Dockerfile to 2-stage build with PyTorch CUDA 13`
- `a8dad56`: `docs(deploy): update README for worker image v2 with cuda 13 and rollback guide`
- `docs: update task p5 execution notes and definition of done` (commit hiện tại)

### 6. Sửa sau build thật (reviewer)
- Build thật fail ở `pip install -r requirements.txt`: `error: externally-managed-environment`. Base 2.14.1 là Ubuntu 24.04 + Python 3.12 hệ thống (không conda, có PEP 668); torch nằm ở `/usr/local/lib/python3.12/dist-packages`. `python -m venv` cũng fail vì thiếu `ensurepip`.
- Sửa: stage final thêm `ENV PIP_BREAK_SYSTEM_PACKAGES=1` và apt thêm `python3.12-venv`. `docker build --check` không phát hiện được loại lỗi này (chỉ kiểm cú pháp) — cần chạy thử các bước trong container base.

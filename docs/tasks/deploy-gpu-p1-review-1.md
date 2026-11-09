# Review vòng 1 — P1 worker image (`feature/deploy_gpu`)

**Kết luận:** Chưa đạt — **2 Blocker** (build fail + mọi job FAILED). Phần còn lại tốt: `download_model.py` và `censor_lib.py` khớp notebook, token chỉ qua BuildKit secret, commit ComfyUI `fca60fe` tồn tại (2026-11-09), 14 test pass. Mỗi mục sửa làm 1 commit nhỏ, chạy lại `python -m py_compile *.py` + `python -m pytest tests -q` trước khi báo xong. Không sửa file ngoài `deploy/runpod-serverless/` (trừ điền ghi chú vào spec P1).

## Blocker

### 1. Dockerfile — bước tải `640m.onnx` là Python sai cú pháp
**Lỗi:** `RUN mkdir -p /models && python -c '\ ... '` (Dockerfile dòng 36–52). Docker nối các dòng có `\` thành **một dòng**, nên Python nhận `...;mirrors = [...];dest = ...;for url in mirrors:    try:  ...`. Không được đặt câu lệnh ghép (`for`, `try`) sau `;` hoặc lồng `try:` trên cùng dòng → `SyntaxError` → build fail.
**Sửa:** Tách thành file `deploy/runpod-serverless/download_nudenet.py` (hàm `download(mirrors, dest) -> bool`, giữ nguyên 2 mirror + kiểm 90–130 MiB, xóa file sai size rồi thử mirror kế, hết mirror → `sys.exit(1)`). Dockerfile: `COPY download_nudenet.py /tmp/` + `RUN python /tmp/download_nudenet.py && rm /tmp/download_nudenet.py`. Thêm test cho logic chọn mirror/kiểm size (mock `urllib.request.urlretrieve`).

### 2. `handler.py:244` — job thành công bị coi là bị từ chối
**Lỗi:** `if prompt_resp.status_code != 200 or "error" in prompt_data or "node_errors" in prompt_data:`. Phản hồi **thành công** của ComfyUI `/prompt` có dạng `{"prompt_id": "...", "number": 0, "node_errors": {}}` — luôn có key `node_errors` (rỗng) → mọi job trả `{"error": "ComfyUI từ chối workflow..."}`. Test hiện tại không bắt được vì không có ca response thành công thật.
**Sửa:** Tách hàm thuần `parse_prompt_response(status_code: int, data: Any) -> tuple[str | None, str | None]` (trả `(prompt_id, error)`): lỗi chỉ khi `status_code != 200`, hoặc `data.get("error")` truthy, hoặc `data.get("node_errors")` là dict **không rỗng**, hoặc thiếu `prompt_id`. Handler gọi hàm này. Test bắt buộc: (a) `{"prompt_id":"p1","number":0,"node_errors":{}}` + 200 → `("p1", None)`; (b) 400 + `node_errors` có node → lỗi chứa node id; (c) 200 thiếu `prompt_id` → lỗi.

## Nên sửa

### 3. `handler.py` — chỉ dọn file tạm khi thành công
**Lỗi:** `cleanup_job_files` chỉ chạy ở cuối nhánh thành công (dòng 310). Mọi `return {"error": ...}` sau khi đã tạo `/tmp/<jobId>` hoặc ComfyUI đã ghi ảnh (lỗi `/view`, lỗi upload R2) đều để lại file → worker sống lâu sẽ đầy đĩa. README §6 lại ghi "thành công hoặc thất bại" — đang sai so với code.
**Sửa:** Bọc phần sau khi có `prompt_id` bằng `try/finally` gọi cleanup. Khi xóa ảnh trong `/comfyui/output`, dùng cả `subfolder` (`comfy_out / subfolder / filename`). Thêm test: lỗi upload R2 (mock `upload_file` ném lỗi) → thư mục tạm vẫn bị xóa.

### 4. `handler.py:291` — bỏ mất lý do censor lỗi
**Lỗi:** `mask_status, _ = run_censor_subprocess(...)` vứt thông báo lỗi → khi `mask_status: failed` không có cách nào biết vì sao.
**Sửa:** `print` lỗi ra stdout (log worker RunPod), dạng `[censor] job=<id> index=<i> failed: <msg>`.

## Gợi ý (không bắt buộc)

### 5. `get_png_dimensions` trả kích thước giả
Fallback `return 1024, 1536` khi không đọc được → dữ liệu sai lặng lẽ. Trả `(None, None)` và để output có `"width": null, "height": null`.

### 6. Pin phiên bản pip ở env chính
`pip install runpod boto3 requests` không pin → image không tái lập. Pin version cụ thể hiện tại (ghi vào README).

## Việc của user (không giao cho agent)
- Sau khi P1 đạt: build/push image, tạo endpoint theo README §4, chạy curl §5.1, gửi Endpoint ID + API key cho Claude.

# Auto-censor sidecar

Che vùng nhạy cảm trong ảnh đã gen bằng NudeNet. Port từ
`RICEE_Day7_Full_Recovery_LUSTIFY_v10_Calendar_YEAR_T4.ipynb` (cell "AUTO
CENSOR V3").

Có **hai backend**:

- **GPU cloud (khuyến nghị, không cần cấu hình gì thêm)** — dịch vụ censor
  (model 640m, chính xác hơn 320n, nhất là anime) chạy trên CÙNG máy GPU Colab
  với ComfyUI, sau CÙNG tunnel. Dựng bằng notebook
  `LUSTIFY_v10_Krea2_Turbo_INT8_Colab_Headless.ipynb` (Cell 7.5 + Cell 8). App tự
  gọi `${comfyBaseUrl}/censor` -- đúng URL tunnel bạn đã dán trong Settings, khỏi
  cần biến env riêng. Chưa chạy Cell 7.5 → ảnh chỉ bị `maskStatus: "skipped"`,
  không báo lỗi.
- **`CENSOR_PYTHON` (fallback)** — chạy CPU local bằng venv dưới đây (model 320n
  mặc định). Dùng khi không cấu hình URL ComfyUI nào trong Settings (dev/offline).

Không có backend nào sẵn sàng → bỏ qua che (ảnh không có bản đã che, `maskStatus`
"skipped").

## Cài đặt (một lần)

`numpy==1.26.4` không hỗ trợ Python 3.13, nên cần một Python **3.11** riêng
(không dùng chung `.venv` của repo). Cách nhanh nhất là qua
[`uv`](https://github.com/astral-sh/uv):

```powershell
pip install uv
uv python install 3.11
uv venv --python 3.11 .censor-env
.censor-env\Scripts\pip install -r scripts\censor\requirements.txt
```

Sau đó đặt trong `.env` của app:

```
CENSOR_PYTHON=.\.censor-env\Scripts\python.exe
```

Lần chạy đầu tiên NudeNet sẽ tự tải model ONNX (cần internet).

## Kiểm thử tay

```powershell
echo '{"items":[{"input":"C:\\path\\goc.png","output":"C:\\path\\da-che.png"}]}' > manifest.json
.censor-env\Scripts\python.exe scripts\censor\censor.py manifest.json
```

In ra JSON `{"results": [{"status": "censored"|"clean"|"failed", ...}]}`.

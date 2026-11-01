# Auto-censor sidecar

Che vùng nhạy cảm trong ảnh đã gen, chạy CPU local bằng NudeNet. Port từ
`RICEE_Day7_Full_Recovery_LUSTIFY_v10_Calendar_YEAR_T4.ipynb` (cell "AUTO
CENSOR V3").

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
CENSOR_PYTHON=D:\model_gen_anh_local_18\MVP_workflow\.censor-env\Scripts\python.exe
```

Lần chạy đầu tiên NudeNet sẽ tự tải model ONNX (cần internet).

## Kiểm thử tay

```powershell
echo '{"items":[{"input":"C:\\path\\goc.png","output":"C:\\path\\da-che.png"}]}' > manifest.json
.censor-env\Scripts\python.exe scripts\censor\censor.py manifest.json
```

In ra JSON `{"results": [{"status": "censored"|"clean"|"failed", ...}]}`.

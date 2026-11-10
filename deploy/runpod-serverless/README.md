# RunPod Serverless Worker cho ComfyUI LUSTIFY & Auto-Censor

TÃ i liá»‡u hÆ°á»›ng dáº«n Ä‘Ã³ng gÃ³i Docker image, triá»ƒn khai vÃ  kiá»ƒm thá»­ RunPod Serverless worker cho backend sinh áº£nh cá»§a Anima Studio.

---

## 1. Tá»•ng quan kiáº¿n trÃºc

Worker cháº¡y dÆ°á»›i dáº¡ng container serverless trÃªn ná»n táº£ng [RunPod Serverless](https://docs.runpod.io/serverless/overview):
- **Base image:** `pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime` (Ä‘Æ°á»£c pin tag chÃ­nh thá»©c tá»« Docker Hub).
- **ComfyUI:** Clone tá»« `https://github.com/Comfy-Org/ComfyUI.git` vÃ  pin commit cá»‘ Ä‘á»‹nh `fca60fe70e5b84c5c6b058263653d15cb3401e44` (Comfy-Org, ngÃ y 2026-11-09) nháº±m Ä‘áº£m báº£o tÃ­nh tÃ¡i láº­p (reproducibility).
- **Baked-in Models:** ToÃ n bá»™ models Ä‘Æ°á»£c nÆ°á»›ng sáºµn vÃ o image Ä‘á»ƒ khÃ´ng phá»¥ thuá»™c vÃ o Network Volume (giÃºp má»Ÿ khÃ³a toÃ n bá»™ Data Centers, trÃ¡nh tÃ¬nh tráº¡ng ngháº½n GPU):
  - `lustifyNSFWCheckpoint_v10Krea2_2996235.safetensors` (13,148,974,712 bytes, SHA-256: `0505412ed2ac568286c4bf43f8ace93f9f5a6dd7a607f47f1912a68767e6900d`) táº£i tá»« CivitAI qua BuildKit secret.
  - `qwen3vl_4b_fp8_scaled.safetensors` (~4.7GB, text encoder Krea2) tá»« HuggingFace.
  - `wan_2.1_vae.safetensors` (~220MB, VAE Wan 2.1) tá»« HuggingFace.
  - `640m.onnx` (~104MB, NudeNet 640m detector) tá»« HuggingFace mirrors.
- **Auto-censor:** TÃ¡ch riÃªng vÃ o virtual environment `/opt/censor-venv` (`nudenet==3.4.2`, `numpy>=1.26,<3`, `onnxruntime`, `Pillow`) trÃ¡nh xung Ä‘á»™t version numpy/torch vá»›i ComfyUI.
- **Main environment dependencies:** Pin phiÃªn báº£n cá»¥ thá»ƒ cho mÃ´i trÆ°á»ng chÃ­nh (`runpod==2.1.0`, `boto3==1.43.126`, `requests==2.34.2`) Ä‘áº£m báº£o image hoÃ n toÃ n cÃ³ thá»ƒ tÃ¡i láº­p.
- **LÆ°u trá»¯ Cloudflare R2:** áº¢nh gá»‘c vÃ  áº£nh che luÃ´n Ä‘Æ°á»£c upload trá»±c tiáº¿p lÃªn R2 bucket theo há»£p Ä‘á»“ng key cá»‘ Ä‘á»‹nh, worker chá»‰ tráº£ vá» object keys (khÃ´ng tráº£ base64 qua payload API).

---

## 2. Há»£p Ä‘á»“ng Input / Output

TÃ i liá»‡u RunPod Endpoint API: [docs.runpod.io/serverless/endpoints/endpoint-api](https://docs.runpod.io/serverless/endpoints/endpoint-api)

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

### Output khi thÃ nh cÃ´ng
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
- `prefix`: GiÃ¡ trá»‹ tá»« biáº¿n mÃ´i trÆ°á»ng `RUNPOD_OUTPUT_PREFIX` (máº·c Ä‘á»‹nh: `runpod-out`).
- `runpodJobId`: ID cá»§a job do RunPod cáº¥p (`job["id"]`).
- `mask_status`: `censored` (Ä‘Ã£ che vÃ¹ng nháº¡y cáº£m), `clean` (áº£nh an toÃ n, khÃ´ng cÃ³ vÃ¹ng cáº§n che), hoáº·c `failed` (lá»—i khi cháº¡y censor).
- Náº¿u `mask_status` lÃ  `failed`, `masked_key` sáº½ cÃ³ giÃ¡ trá»‹ `null` vÃ  job váº«n Ä‘Æ°á»£c coi lÃ  thÃ nh cÃ´ng.
- `width` vÃ  `height`: KÃ­ch thÆ°á»›c pixel Ä‘á»c trá»±c tiáº¿p tá»« header PNG IHDR (náº¿u khÃ´ng Ä‘á»c Ä‘Æ°á»£c tá»« header, tráº£ vá» `null`).
- Khi cÃ³ lá»—i (workflow khÃ´ng há»£p lá»‡, ComfyUI tá»« chá»‘i, timeout, upload R2 tháº¥t báº¡i), handler tráº£ vá» `{"error": "<mÃ´ táº£ ngáº¯n, cÃ³ node_errors náº¿u cÃ³>"}` Ä‘á»ƒ RunPod Ä‘Ã¡nh dáº¥u job lÃ  FAILED.

---

## 3. HÆ°á»›ng dáº«n Build & Push Docker Image

TÃ i liá»‡u BuildKit Secret: [docs.docker.com/build/building/secrets/](https://docs.docker.com/build/building/secrets/)

1. Chuáº©n bá»‹ file `token.txt` trong thÆ° má»¥c `deploy/runpod-serverless/` chá»©a CivitAI API token (file nÃ y Ä‘Ã£ Ä‘Æ°á»£c cáº¥u hÃ¬nh trong `.gitignore` vÃ  `.dockerignore`, tuyá»‡t Ä‘á»‘i khÃ´ng commit vÃ o git):
   ```bash
   echo "YOUR_CIVITAI_API_TOKEN" > deploy/runpod-serverless/token.txt
   ```

2. Build Docker image sá»­ dá»¥ng BuildKit Secret (token khÃ´ng bá»‹ lÆ°u vÃ o image layer hay biáº¿n mÃ´i trÆ°á»ng):
   ```bash
   DOCKER_BUILDKIT=1 docker build \
     --secret id=civitai_token,src=deploy/runpod-serverless/token.txt \
     -t <dockerhub-username>/anima-serverless:v1.0.0 \
     deploy/runpod-serverless/
   ```

3. Push image lÃªn container registry:
   ```bash
   docker push <dockerhub-username>/anima-serverless:v1.0.0
   ```

---

## 4. Cáº¥u hÃ¬nh RunPod Serverless Endpoint

TÃ i liá»‡u cáº¥u hÃ¬nh Endpoint RunPod: [docs.runpod.io/serverless/overview](https://docs.runpod.io/serverless/overview)

VÃ o trang **RunPod Console** -> **Serverless** -> **New Endpoint**:

1. **General Settings:**
   - **Endpoint Name:** `anima-serverless-worker`
   - **Container Image:** `<dockerhub-username>/anima-serverless:v1.0.0`
   - **Container Disk:** Tá»‘i thiá»ƒu `30 GB` (image chá»©a models náº·ng ~20GB).
2. **GPU & Availability:**
   - **GPU Types:** Chá»n nhiá»u dÃ²ng GPU 24GB, 32GB, 48GB, Æ°u tiÃªn theo giÃ¡ ráº» trÆ°á»›c:
     - RTX 3090 (24GB)
     - RTX 4090 (24GB)
     - RTX A5000 (24GB)
     - RTX 6000 Ada / A40 / L40 (48GB)
   - **Data Centers:** Chá»n **All data centers** (táº¥t cáº£ 34 DC) Ä‘á»ƒ Ä‘áº£m báº£o luÃ´n cÃ³ GPU kháº£ dá»¥ng.
   - **Network Volume:** **KHÃ”NG** gáº¯n Network Volume (Ä‘á»ƒ trÃ¡nh bá»‹ khÃ³a vÃ o 1 DC duy nháº¥t).
3. **Scaling & Worker Policy:**
   - **Min Workers:** `0` (tá»± táº¯t khi khÃ´ng cÃ³ request Ä‘á»ƒ tiáº¿t kiá»‡m chi phÃ­).
   - **Max Workers:** `1` Ä‘áº¿n `3` tÃ¹y nhu cáº§u song song.
   - **Idle Timeout:** `60` Ä‘áº¿n `300` giÃ¢y (giá»¯ worker hoáº¡t Ä‘á»™ng thÃªm má»™t khoáº£ng thá»i gian chá» batch tiáº¿p theo).
   - **FlashBoot:** **Báº­t** (tÄƒng tá»‘c Ä‘á»™ khá»Ÿi Ä‘á»™ng láº¡i worker).
4. **Environment Variables:**
   - `R2_ACCOUNT_ID`: Cloudflare Account ID.
   - `R2_ACCESS_KEY_ID`: Cloudflare R2 Access Key ID.
   - `R2_SECRET_ACCESS_KEY`: Cloudflare R2 Secret Access Key.
   - `R2_BUCKET`: TÃªn bucket R2.
   - `RUNPOD_OUTPUT_PREFIX`: (TÃ¹y chá»n) `runpod-out`.
   - `COMFY_JOB_TIMEOUT_S`: (TÃ¹y chá»n) `600`.
   - `CENSOR_MODEL_PATH`: (TÃ¹y chá»n) `/models/640m.onnx`.
   - `CENSOR_INFERENCE_RESOLUTION`: (TÃ¹y chá»n) `640`.
   *(Khuyáº¿n nghá»‹: Táº¡o Cloudflare R2 API Token riÃªng vá»›i quyá»n Object Read & Write chá»‰ trÃªn bucket nÃ y).*

---

## 5. Kiá»ƒm thá»­ Endpoint (RunPod API & Local)

TÃ i liá»‡u RunPod Local Testing: [docs.runpod.io/serverless/workers/development/local-testing](https://docs.runpod.io/serverless/workers/development/local-testing)
TÃ i liá»‡u RunPod Job Status: [docs.runpod.io/serverless/endpoints/job-status](https://docs.runpod.io/serverless/endpoints/job-status)

### 5.1 Kiá»ƒm tra trÃªn RunPod Cloud
Äáº·t biáº¿n mÃ´i trÆ°á»ng terminal:
```bash
export RUNPOD_API_KEY="your-runpod-api-key"
export ENDPOINT_ID="your-endpoint-id"
```

1. **Kiá»ƒm tra tráº¡ng thÃ¡i Endpoint:**
   ```bash
   curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
     "https://api.runpod.ai/v2/$ENDPOINT_ID/health"
   ```

2. **Gá»­i job sinh áº£nh (Async `/run`):**
   ```bash
   curl -X POST \
     -H "Authorization: Bearer $RUNPOD_API_KEY" \
     -H "Content-Type: application/json" \
     -d @deploy/runpod-serverless/test_input.json \
     "https://api.runpod.ai/v2/$ENDPOINT_ID/run"
   ```
   Káº¿t quáº£ tráº£ vá» `{"id": "<jobId>", "status": "IN_QUEUE"}`.

3. **Kiá»ƒm tra tiáº¿n Ä‘á»™ job:**
   ```bash
   curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
     "https://api.runpod.ai/v2/$ENDPOINT_ID/status/<jobId>"
   ```
   Khi hoÃ n thÃ nh, `status` lÃ  `COMPLETED`. Kiá»ƒm tra 2 file áº£nh Ä‘Ã£ Ä‘Æ°á»£c upload lÃªn Cloudflare R2 theo key `runpod-out/<jobId>/0.png` vÃ  `runpod-out/<jobId>/0.masked.png`.

### 5.2 Kiá»ƒm tra Local báº±ng RunPod SDK
Theo tÃ i liá»‡u RunPod SDK, cÃ³ 3 cÃ¡ch kiá»ƒm tra cá»¥c bá»™:

1. **Sá»­ dá»¥ng flag `--test_input`:**
   ```bash
   python handler.py --test_input '{"input": {"workflow": {"1": {"class_type": "KSampler"}}}}'
   ```
2. **Sá»­ dá»¥ng file `test_input.json`:**
   Äáº·t file `test_input.json` cÃ¹ng thÆ° má»¥c vá»›i `handler.py` vÃ  cháº¡y:
   ```bash
   python handler.py
   ```
   RunPod SDK sáº½ tá»± Ä‘á»™ng phÃ¡t hiá»‡n `test_input.json` vÃ  cháº¡y job kiá»ƒm thá»­.
3. **MÃ´ phá»ng mÃ¡y chá»§ HTTP cá»¥c bá»™ vá»›i `--rp_serve_api`:**
   ```bash
   python handler.py --rp_serve_api
   ```
   Gá»­i HTTP request tá»›i `http://localhost:8000/runsync` Ä‘á»ƒ test luá»“ng HTTP.

---

## 6. Ghi chÃº Báº£o trÃ¬ & NÃ¢ng cáº¥p

- **ComfyUI Commit Pin:** Image hiá»‡n Ä‘ang pin commit `fca60fe70e5b84c5c6b058263653d15cb3401e44`. Äá»ƒ nÃ¢ng cáº¥p ComfyUI:
  1. Kiá»ƒm tra commit má»›i nháº¥t: `git ls-remote https://github.com/Comfy-Org/ComfyUI.git HEAD`.
  2. Cáº­p nháº­t commit SHA trong `deploy/runpod-serverless/Dockerfile`.
  3. Kiá»ƒm tra tÃ­nh tÆ°Æ¡ng thÃ­ch cá»§a cÃ¡c custom node Krea2/Qwen3VL/Wan2.1 vá»›i version má»›i.
- **Quáº£n lÃ½ dung lÆ°á»£ng Ä‘Ä©a:** Sau má»—i job sinh áº£nh thÃ nh cÃ´ng hoáº·c tháº¥t báº¡i, khá»‘i `try/finally` trong handler sáº½ luÃ´n tá»± Ä‘á»™ng dá»n dáº¹p thÆ° má»¥c táº¡m `/tmp/<jobId>` vÃ  toÃ n bá»™ áº£nh sinh ra trong `/comfyui/output/` (bao gá»“m cáº£ thÆ° má»¥c con náº¿u cÃ³ `subfolder`) nháº±m báº£o vá»‡ container disk khÃ´ng bá»‹ Ä‘áº§y khi worker hoáº¡t Ä‘á»™ng lÃ¢u dÃ i.
- **Ghi log lá»—i censor:** Khi tiáº¿n trÃ¬nh che áº£nh gáº·p sá»± cá»‘ (`mask_status: failed`), chi tiáº¿t lá»—i sáº½ Ä‘Æ°á»£c log rÃµ rÃ ng ra stdout cá»§a worker theo Ä‘á»‹nh dáº¡ng `[censor] job=<id> index=<i> failed: <msg>` Ä‘á»ƒ ngÆ°á»i váº­n hÃ nh dá»… dÃ ng cháº©n Ä‘oÃ¡n trÃªn RunPod Console.

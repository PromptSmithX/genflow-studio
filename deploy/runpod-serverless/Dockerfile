# Base image with PyTorch 2.8 and CUDA 12.8 runtime
FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime

# Suppress interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install required system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    wget \
    ca-certificates \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Clone ComfyUI repository and checkout pinned commit
RUN git clone https://github.com/Comfy-Org/ComfyUI.git /comfyui && \
    cd /comfyui && \
    git checkout fca60fe70e5b84c5c6b058263653d15cb3401e44

# Install ComfyUI dependencies
RUN pip install --no-cache-dir -r /comfyui/requirements.txt

# Download HuggingFace text encoder and verify minimum size
RUN mkdir -p /comfyui/models/text_encoders && \
    wget -c --show-progress https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors -O /comfyui/models/text_encoders/qwen3vl_4b_fp8_scaled.safetensors && \
    [ $(stat -c%s /comfyui/models/text_encoders/qwen3vl_4b_fp8_scaled.safetensors) -ge 4700000000 ] || (echo "Text encoder download invalid" && exit 1)

# Download Wan 2.1 VAE and verify minimum size
RUN mkdir -p /comfyui/models/vae && \
    wget -c --show-progress https://huggingface.co/Comfy-Org/Wan-2.1/resolve/main/split_files/vae/wan_2.1_vae.safetensors -O /comfyui/models/vae/wan_2.1_vae.safetensors && \
    [ $(stat -c%s /comfyui/models/vae/wan_2.1_vae.safetensors) -ge 220000000 ] || (echo "VAE download invalid" && exit 1)

# Download NudeNet 640m detector using standalone python script
COPY download_nudenet.py /tmp/download_nudenet.py
RUN python /tmp/download_nudenet.py && rm /tmp/download_nudenet.py

# Download LUSTIFY checkpoint using BuildKit secret mount
COPY download_model.py /tmp/download_model.py
RUN --mount=type=secret,id=civitai_token python /tmp/download_model.py && rm /tmp/download_model.py

# Setup isolated virtual environment for censorship dependencies
RUN python -m venv /opt/censor-venv && \
    /opt/censor-venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/censor-venv/bin/pip install --no-cache-dir "nudenet==3.4.2" "numpy>=1.26,<3" opencv-python-headless "onnxruntime>=1.19,<2" "Pillow>=10,<12"

# Install RunPod worker and storage client dependencies
RUN pip install --no-cache-dir runpod==2.1.0 boto3==1.43.126 requests==2.32.3

# Copy handler and censorship worker scripts
COPY censor_lib.py /censor_lib.py
COPY censor_cli.py /censor_cli.py
COPY handler.py /handler.py

# Set working directory and default execution command
WORKDIR /
CMD ["python", "-u", "/handler.py"]

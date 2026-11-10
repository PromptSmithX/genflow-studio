import json
import sys
from PIL import Image
from censor_lib import censor_image

# Entrypoint for standalone image censorship
def main():
    if len(sys.argv) < 3:
        print(json.dumps({"status": "failed", "error": "Usage: censor_cli.py <input.png> <output.png>"}))
        sys.exit(1)
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    try:
        photo = Image.open(input_path).convert("RGB")
        censored_photo, status = censor_image(photo)
        censored_photo.save(output_path, format="PNG")
        print(json.dumps({"status": status}))
        sys.exit(0)
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}))
        sys.exit(1)

if __name__ == "__main__":
    main()

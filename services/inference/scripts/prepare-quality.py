"""Explicit one-time download. Never invoked by inference or application startup."""
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
os.environ["HF_HUB_OFFLINE"] = "0"
os.environ["TRANSFORMERS_OFFLINE"] = "0"
os.environ["HF_HOME"] = str(ROOT / "data/models/download-cache")
from huggingface_hub import snapshot_download
snapshot_download("openai/whisper-large-v3-turbo", local_dir=ROOT / "data/models/whisper-large-v3-turbo",
                  allow_patterns=["*.json", "merges.txt", "model.safetensors"])
print("Local speech verification model ready. No TTS environment packages were changed.")

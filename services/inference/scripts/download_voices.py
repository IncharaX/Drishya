"""Online setup only. Download the two configured Piper voices and model cards."""

import hashlib
import json
from pathlib import Path
import ssl
import urllib.request

import certifi

ROOT = Path(__file__).resolve().parents[3]
TARGET = ROOT / "data" / "models" / "piper"
TARGET.mkdir(parents=True, exist_ok=True)
BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
CONTEXT = ssl.create_default_context(cafile=certifi.where())


def fetch(path):
    return urllib.request.urlopen(BASE + path, context=CONTEXT, timeout=120)


with fetch("voices.json") as source:
    catalog = json.load(source)

for voice_id in ["hi_IN-priyamvada-medium", "mr_IN-google-medium"]:
    voice = catalog.get(voice_id)
    if not voice:
        raise SystemExit(f"Official catalog does not contain {voice_id}; choose a published voice before continuing.")
    manifest = {"id": voice_id, "source": BASE, "files": {}}
    for remote, expected in voice["files"].items():
        if not (remote.endswith(".onnx") or remote.endswith(".onnx.json") or remote.endswith("MODEL_CARD")):
            continue
        name = f"{voice_id}-MODEL_CARD" if remote.endswith("MODEL_CARD") else Path(remote).name
        destination = TARGET / name
        temp = destination.with_suffix(destination.suffix + ".part")
        if destination.is_file() and expected.get("md5_digest"):
            with destination.open("rb") as existing:
                current_md5 = hashlib.file_digest(existing, "md5").hexdigest()
            if current_md5 == expected["md5_digest"]:
                with destination.open("rb") as existing:
                    current_sha = hashlib.file_digest(existing, "sha256").hexdigest()
                manifest["files"][name] = {"sha256": current_sha, "bytes": destination.stat().st_size}
                print(f"Using downloaded {name}", flush=True)
                continue
        print(f"Downloading {voice_id}: {name}", flush=True)
        sha = hashlib.sha256()
        md5 = hashlib.md5(usedforsecurity=False)
        with fetch(remote) as source, temp.open("wb") as output:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                output.write(chunk); sha.update(chunk); md5.update(chunk)
        if expected.get("md5_digest") and md5.hexdigest() != expected["md5_digest"]:
            temp.unlink(missing_ok=True)
            raise SystemExit(f"Checksum mismatch for {name}; rerun setup.")
        temp.replace(destination)
        manifest["files"][name] = {"sha256": sha.hexdigest(), "bytes": destination.stat().st_size}
    (TARGET / f"{voice_id}.manifest.json").write_text(json.dumps(manifest, indent=2))
print("Voice assets downloaded. Inference uses these local files without network access.")

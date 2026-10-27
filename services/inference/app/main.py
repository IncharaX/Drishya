"""Authenticated local speech boundary, using only stdlib + the existing TTS env."""

import hashlib
import hmac
import json
import os
from pathlib import Path
import shutil
import signal
import sys
import threading
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Also support direct launch with the existing Python, without a dotenv dependency.
ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / ".env").read_text().splitlines():
    if line.strip() and not line.lstrip().startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

from indic_parler import IndicParler, PROFILES, TTSError

SECRET = os.environ.get("INFERENCE_SECRET", "")
if len(SECRET) < 32:
    raise RuntimeError("Set INFERENCE_SECRET (at least 32 characters) in services/inference/.env")
AUDIO = (ROOT / os.environ.get("DRISHYA_DATA_DIR", "../../data")).resolve() / "audio"
AUDIO.mkdir(parents=True, exist_ok=True)
MODEL = IndicParler()
LOCK = threading.Lock()


def wav_info(path):
    with wave.open(str(path), "rb") as audio:
        if audio.getnframes() <= 0 or audio.getsampwidth() != 2 or audio.getnchannels() != 1:
            raise ValueError("Invalid PCM16 mono WAV")
        return {"durationSeconds": audio.getnframes() / audio.getframerate(), "sampleRate": audio.getframerate(), "channels": 1}


def resolve_output(value):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > 4096:
        raise TTSError("INVALID_OUTPUT_PATH", "output_path must be a WAV path under Drishya's audio directory.", 400)
    candidate = Path(value).expanduser()
    target = (candidate if candidate.is_absolute() else AUDIO / candidate).resolve()
    if not target.is_relative_to(AUDIO.resolve()) or target.suffix.lower() != ".wav":
        raise TTSError("INVALID_OUTPUT_PATH", "output_path must stay inside Drishya's configured audio directory and end in .wav.", 400)
    return target


def copy_output(source, destination):
    if destination is None or destination == source:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_name(f".{uuid.uuid4().hex}.wav")
    try:
        try:
            os.link(source, temp)
        except OSError:
            shutil.copyfile(source, temp)
        temp.replace(destination)
    finally:
        temp.unlink(missing_ok=True)


def synthesize(body):
    if not isinstance(body, dict):
        raise TTSError("INVALID_REQUEST", "Expected a JSON object.", 400)
    if set(body) - {"text", "language", "output_path", "outputPath", "voiceId", "speed"}:
        raise TTSError("INVALID_REQUEST", "Unexpected speech request fields.", 400)
    language, text = body.get("language"), body.get("text")
    if language not in PROFILES:
        raise TTSError("UNSUPPORTED_LANGUAGE", "Supported narration languages are en, hi, kn and te.", 400)
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 1600:
        raise TTSError("INVALID_TEXT", "Narration must contain 1–1600 characters.", 400)
    if body.get("speed", 1) != 1:
        raise TTSError("UNSUPPORTED_SPEED", "This provider uses the known-working natural teaching pace (1×). Speed processing belongs in the later audio pipeline.", 400)
    speaker = PROFILES[language][0]
    voice_id = f"indic-parler-{language}-{speaker.lower()}"
    if body.get("voiceId", voice_id) != voice_id:
        raise TTSError("UNSUPPORTED_VOICE", "Choose the configured Indic Parler speaker for this language.", 400)
    output = resolve_output(body.get("output_path", body.get("outputPath")))
    text = text.strip()
    with LOCK:
        settings = MODEL.settings(language)
        key = hashlib.sha256(json.dumps({"text": text, "settings": settings}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        target, manifest = AUDIO / f"{key}.wav", AUDIO / f"{key}.json"
        if target.is_file() and manifest.is_file():
            try:
                saved = json.loads(manifest.read_text())
                actual = wav_info(target)
                if saved.get("assetKey") == key and saved.get("settings") == settings:
                    copy_output(target, output)
                    return {**saved, **actual, "cached": True, "output_path": str(output or target)}
            except (OSError, ValueError, EOFError, wave.Error):
                pass
        temp = AUDIO / f"{uuid.uuid4().hex}.wav"
        try:
            MODEL.generate(text, language, temp)
            result = {"assetKey": key, **wav_info(temp), "settings": settings}
            temp.replace(target)
            metadata = AUDIO / f"{uuid.uuid4().hex}.json"
            metadata.write_text(json.dumps(result, ensure_ascii=False))
            metadata.replace(manifest)
            copy_output(target, output)
            return {**result, "cached": False, "output_path": str(output or target)}
        finally:
            temp.unlink(missing_ok=True)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        payload = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def authenticated(self):
        valid = hmac.compare_digest(self.headers.get("Authorization", "").encode(), f"Bearer {SECRET}".encode())
        if not valid:
            self.reply(401, {"error": {"code": "UNAUTHORIZED", "message": "Local inference authorization failed."}})
        return valid

    def do_GET(self):
        if not self.authenticated():
            return
        try:
            if self.path == "/voices":
                self.reply(200, {"voices": MODEL.voices()})
            elif self.path == "/health":
                self.reply(200, {"status": "ok", **MODEL.status()})
            else:
                self.reply(404, {"error": {"code": "NOT_FOUND", "message": "Route not found."}})
        except TTSError as error:
            self.reply(error.status, {"error": {"code": error.code, "message": str(error)}})
        except Exception as error:
            print(f"Speech metadata failure: {type(error).__name__}", file=sys.stderr, flush=True)
            self.reply(500, {"error": {"code": "SERVICE_ERROR", "message": "Could not read the existing TTS setup. Check TTS_PYTHON and its cached packages."}})

    def do_POST(self):
        if not self.authenticated():
            return
        try:
            if self.path != "/synthesize":
                raise TTSError("NOT_FOUND", "Route not found.", 404)
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 32768:
                raise TTSError("INVALID_REQUEST", "Speech request is empty or too large.", 400)
            result = synthesize(json.loads(self.rfile.read(length)))
            self.reply(200, result)
        except TTSError as error:
            print(f"Speech error: {error.code}", file=sys.stderr, flush=True)
            self.reply(error.status, {"error": {"code": error.code, "message": str(error)}})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.reply(400, {"error": {"code": "INVALID_REQUEST", "message": "Invalid speech request JSON."}})
        except Exception as error:
            print(f"Speech generation failure: {type(error).__name__}", file=sys.stderr, flush=True)
            self.reply(500, {"error": {"code": "GENERATION_FAILED", "message": "Local narration failed. Check available memory and the speech process logs."}})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("INFERENCE_PORT", "8001"))), Handler)
    server.daemon_threads = True
    def stop(_signal, _frame):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(f"Drishya speech listening on 127.0.0.1:{server.server_port}; interpreter: {sys.executable}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()

"""Persistent adapter for the user's known-working ~/AI/indic-tts/test.py setup."""

import importlib.metadata
import os
from pathlib import Path
import sys

# Set before importing Torch/Transformers/Hugging Face. Never resolve online.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["DO_NOT_TRACK"] = "1"

MODEL_NAME = "ai4bharat/indic-parler-tts"
PROFILES = {
    "en": ("Thoma", "Thoma speaks clearly in English with a natural teaching voice. The audio is very clear with no background noise."),
    "hi": ("Rohit", "Rohit speaks clearly in Hindi with a natural teaching voice. The audio is very clear with no background noise."),
    "kn": ("Suresh", "Suresh speaks clearly in Kannada with a natural teaching voice. The audio is very clear with no background noise."),
    "te": ("Prakash", "Prakash speaks clearly in Telugu with a natural teaching voice. The audio is very clear with no background noise."),
}


class TTSError(Exception):
    def __init__(self, code, message, status=500):
        super().__init__(message)
        self.code, self.status = code, status


class IndicParler:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.description_tokenizer = None
        self.device = None
        self.load_count = 0
        self.load_error = None

    def load(self):
        if self.model is not None:
            return
        try:
            import torch
            from parler_tts import ParlerTTSForConditionalGeneration
            from transformers import AutoTokenizer

            # Same model, device selection, tokenizers and dtype defaults as test.py.
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            print(f"Loading cached {MODEL_NAME} on {device} using {sys.executable}", flush=True)
            model = ParlerTTSForConditionalGeneration.from_pretrained(
                MODEL_NAME, local_files_only=True
            ).to(device)
            tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, local_files_only=True)
            description_tokenizer = AutoTokenizer.from_pretrained(
                model.config.text_encoder._name_or_path, local_files_only=True
            )
            self.model = model
            self.tokenizer = tokenizer
            self.description_tokenizer = description_tokenizer
            self.device = device
            self.load_count += 1
            self.load_error = None
            print(f"Indic Parler ready on {device}; model loads: {self.load_count}", flush=True)
        except Exception as error:
            self.load_error = f"Cached Indic Parler could not load ({type(error).__name__}). Check TTS_PYTHON and the existing local model/tokenizer cache; no download was attempted."
            raise TTSError("MODEL_LOAD_FAILED", self.load_error, 503) from error

    def revision(self):
        from huggingface_hub import try_to_load_from_cache
        config = try_to_load_from_cache(MODEL_NAME, "config.json")
        if not isinstance(config, str):
            raise TTSError("MODEL_CACHE_MISSING", "Indic Parler's configuration is not in this interpreter's local Hugging Face cache. Check HF_HOME/HF_HUB_CACHE against the working setup.", 503)
        return Path(config).parent.name

    def voices(self):
        try:
            revision = self.revision()
            reason = self.load_error
        except TTSError as error:
            revision, reason = "missing", str(error)
        return [{"id": f"indic-parler-{language}-{speaker.lower()}", "language": language, "label": f"{speaker} · {name} · Indic Parler", "provider": "indic-parler", "revision": revision, "ready": reason is None, "reason": reason} for language, (speaker, _) in PROFILES.items() for name in [{"en": "English", "hi": "Hindi", "kn": "Kannada", "te": "Telugu"}[language]]]

    def settings(self, language):
        if language not in PROFILES:
            raise TTSError("UNSUPPORTED_LANGUAGE", "Supported narration languages are en, hi, kn and te.", 400)
        speaker, description = PROFILES[language]
        return {
            "provider": "indic-parler", "model": MODEL_NAME, "revision": self.revision(),
            "language": language, "speaker": speaker, "description": description,
            "generation": "test.py-defaults-v1", "normalization": "strip-only-v1",
            "speed": 1, "output": "wav-pcm16-mono",
            "torch": importlib.metadata.version("torch"),
            "transformers": importlib.metadata.version("transformers"),
            "parlerTts": importlib.metadata.version("parler-tts"),
            "soundfile": importlib.metadata.version("soundfile"),
        }

    def generate(self, text, language, output_path):
        if language not in PROFILES:
            raise TTSError("UNSUPPORTED_LANGUAGE", "Supported narration languages are en, hi, kn and te.", 400)
        self.load()
        try:
            import numpy as np
            import torch
            import soundfile as sf

            description = self.description_tokenizer(
                PROFILES[language][1], return_tensors="pt"
            ).to(self.device)
            prompt = self.tokenizer(text, return_tensors="pt").to(self.device)
            # Intentionally preserve the exact generation arguments from test.py.
            with torch.inference_mode():
                generation = self.model.generate(
                    input_ids=description.input_ids,
                    attention_mask=description.attention_mask,
                    prompt_input_ids=prompt.input_ids,
                    prompt_attention_mask=prompt.attention_mask,
                )
            audio = generation.cpu().numpy().squeeze()
            if audio.ndim != 1 or audio.size == 0 or not np.isfinite(audio).all() or not np.any(audio):
                raise ValueError("Model returned empty or invalid audio")
            sf.write(str(output_path), audio, self.model.config.sampling_rate, subtype="PCM_16")
        except Exception as error:
            raise TTSError("GENERATION_FAILED", f"Indic Parler could not generate this narration ({type(error).__name__}). The model remains loaded; check the sentence and available memory before retrying.") from error

    def status(self):
        return {"provider": "indic-parler", "model": MODEL_NAME, "modelLoaded": self.model is not None, "modelLoadCount": self.load_count, "device": self.device, "python": sys.executable, "pid": os.getpid()}

"""Verified, cached short speech chunks joined into one narration WAV."""
import hashlib
import json
import time
import uuid
import secrets
import re
from pathlib import Path
from speech_quality import VERSION, QualityError, split_narration, spoken_text, verify_audio

def generate_narration(model, text, language, output_path, voice_id,cancelled=None):
    import numpy as np
    import soundfile as sf
    import torch
    started = time.perf_counter()
    directory = Path(output_path).parent / "verified-chunks"
    directory.mkdir(parents=True, exist_ok=True)
    rate = None
    arrays, captions, metrics = [], [], []
    offset = 0.

    def one(original, depth=0):
        nonlocal rate, offset
        if cancelled and cancelled():raise QualityError("Narration request was cancelled.")
        spoken = spoken_text(original, language)
        settings=model.settings(language,voice_id)
        key=hashlib.sha256(json.dumps({"text":original,"spoken":spoken,"settings":settings,"quality":VERSION},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        audio_file=directory/f"{key}.wav"; metadata=directory/f"{key}.json"
        cached=False
        if audio_file.is_file() and metadata.is_file():
            try:
                quality=json.loads(metadata.read_text())
                samples,sample_rate=sf.read(str(audio_file),dtype="float32")
                cached=quality.get("version")==VERSION and quality.get("verified") is True and samples.ndim==1 and len(samples)>0 and abs(len(samples)/sample_rate-quality["durationSeconds"])<.03
            except (OSError,ValueError,KeyError):cached=False
        elapsed=time.perf_counter()
        if not cached:
            failure=None
            for attempt in range(2):
                if cancelled and cancelled():raise QualityError("Narration request was cancelled.")
                temporary=directory/f"{uuid.uuid4().hex}.wav"
                try:
                    # A distinct seed gives a bounded retry without changing model packages or voices.
                    seed=secrets.randbits(32)
                    torch.manual_seed(seed)
                    model._generate_chunk(spoken,language,temporary,voice_id)
                    if cancelled and cancelled():raise QualityError("Narration request was cancelled.")
                    quality=verify_audio(temporary,original,language)
                    quality["seed"]=seed
                    samples,sample_rate=sf.read(str(temporary),dtype="float32")
                    temporary.replace(audio_file)
                    manifest=directory/f"{uuid.uuid4().hex}.json"
                    manifest.write_text(json.dumps(quality,ensure_ascii=False));manifest.replace(metadata)
                    failure=None;break
                except QualityError as error:
                    failure=error
                    rejected=directory/"rejected";rejected.mkdir(exist_ok=True)
                    if temporary.is_file():
                        temporary.replace(rejected/f"{key}-{attempt}.wav")
                        (rejected/f"{key}-{attempt}.json").write_text(json.dumps({"error":str(error),"language":language,"seed":seed,**error.details},ensure_ascii=False))
                finally:temporary.unlink(missing_ok=True)
            if failure is not None:
                sentences=[part.strip() for part in re.split(r"(?<=[.!?।;])\s+",original) if part.strip()]
                if depth<1 and len(sentences)>1:
                    for sentence in sentences:one(sentence,depth+1)
                    return
                raise QualityError(f"Could not verify a clear, complete narration after retrying: {failure}")
        if rate is None:rate=sample_rate
        if rate!=sample_rate:raise QualityError("Speech chunks have inconsistent sample rates.")
        for cue in quality["captions"]:captions.append({**cue,"start":cue["start"]+offset,"end":cue["end"]+offset})
        arrays.append(samples);offset+=len(samples)/rate
        pause=np.zeros(round(rate*.12),dtype=np.float32);arrays.append(pause);offset+=len(pause)/rate
        metrics.append({"seconds":len(samples)/rate,"cached":cached,"elapsedMs":(time.perf_counter()-elapsed)*1000,"errorRate":quality["errorRate"]})

    for chunk in split_narration(text,language):one(chunk)
    if not arrays:raise QualityError("No spoken narration was produced.")
    arrays.pop() # No padded silence after the final sentence.
    joined=np.concatenate(arrays)
    sf.write(str(output_path),joined,rate,subtype="PCM_16")
    return {"totalMs":(time.perf_counter()-started)*1000,"audioSeconds":len(joined)/rate,"modelLoadCount":model.load_count,"device":model.device,"chunkCount":len(metrics),"quality":{"verified":True,"version":VERSION,"chunks":metrics},"captions":captions}

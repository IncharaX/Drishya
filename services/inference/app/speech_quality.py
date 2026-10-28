"""Offline recognition, transcript comparison and audio-derived caption timing."""
import re
import unicodedata
from pathlib import Path
from difflib import SequenceMatcher

VERSION = "verified-chunks-v1"
MODEL_PATH = Path(__file__).resolve().parents[3] / "data/models/whisper-large-v3-turbo"
LANGUAGES = {"en": "english", "hi": "hindi", "kn": "kannada", "te": "telugu"}
_recognizer = None

class QualityError(Exception):
    def __init__(self,message,details=None):
        super().__init__(message);self.details=details or {}

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "zero ten twenty thirty forty fifty sixty seventy eighty ninety".split()
def number_words(value):
    value = int(value)
    if value < 20: return ONES[value]
    if value < 100: return TENS[value // 10] + (" " + ONES[value % 10] if value % 10 else "")
    if value < 1000: return ONES[value // 100] + " hundred" + (" " + number_words(value % 100) if value % 100 else "")
    if value < 1000000: return number_words(value // 1000) + " thousand" + (" " + number_words(value % 1000) if value % 1000 else "")
    return " ".join(ONES[int(char)] for char in str(value))

def spoken_text(text, language):
    text = unicodedata.normalize("NFKC", text).replace("’", "'")
    for term,value in {"JavaScript":"Java script","TypeScript":"Type script","Node.js":"Node J S","Next.js":"Next J S"}.items():
        text=re.sub(r"(?<!\w)"+re.escape(term)+r"(?!\w)",value,text,flags=re.IGNORECASE)
    # Preserve meaning and names; expand only explicit technical forms.
    replacements = {"APIs": "A P I s", "API": "A P I", "AI":"A I", "JSON": "J S O N", "MP4": "M P four", "LLMs": "L L M s", "LLM": "L L M", "CPU": "C P U", "GPU": "G P U", "RAM": "ram", "GB": "gigabytes", "MB": "megabytes", "PDF": "P D F", "HTML": "H T M L", "CSS": "C S S", "SQL": "S Q L", "URL": "U R L"}
    for term, value in replacements.items():
        text = re.sub(r"(?<!\w)" + re.escape(term) + r"(?!\w)", value, text)
    if language == "en":
        text = re.sub(r"(?<=\d)[–—-](?=\d)", " to ", text)
        text = re.sub(r"\b(\d+)\.(\d+)\b", lambda m: number_words(m[1]) + " point " + " ".join(ONES[int(n)] for n in m[2]), text)
        text = re.sub(r"\b\d+\b", lambda m: number_words(m[0]), text)
        text = text.replace("%", " percent")
    return text

def tokens(text, language):
    text = spoken_text(text, language).lower()
    for short,long in {"don't":"do not","doesn't":"does not","isn't":"is not","aren't":"are not","can't":"cannot","you're":"you are","we're":"we are","they're":"they are","it's":"it is","that's":"that is","you'll":"you will","we'll":"we will"}.items():text=text.replace(short,long)
    text = "".join(char if unicodedata.category(char)[0] in "LMN" else " " for char in text)
    return text.split()

def split_narration(text, language):
    # Small coherent groups stay well below the provider's approximately 30s ceiling.
    limit = 150 if language == "en" else 110
    sentences = re.split(r"(?<=[.!?।])\s+", text.strip())
    result = []
    for sentence in sentences:
        words = sentence.split()
        current = []
        for word in words:
            if current and (len(" ".join(current + [word])) > limit or len(current) >= 22):
                result.append(" ".join(current)); current = []
            current.append(word)
        if current: result.append(" ".join(current))
    grouped=[]
    for piece in result:
        if grouped and len(grouped[-1])+len(piece)+1<=limit and len((grouped[-1]+" "+piece).split())<=22:grouped[-1]+=" "+piece
        else:grouped.append(piece)
    return grouped

def recognizer():
    global _recognizer
    if _recognizer is None:
        if not (MODEL_PATH / "model.safetensors").is_file():
            raise QualityError("Local speech verification model is missing. Run services/inference/scripts/prepare-quality.py once; inference never downloads models.")
        from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
        import torch
        # CPU avoids competing with Indic Parler's MPS working memory.
        model = AutoModelForSpeechSeq2Seq.from_pretrained(str(MODEL_PATH), local_files_only=True, attn_implementation="eager", torch_dtype=torch.float32)
        processor = AutoProcessor.from_pretrained(str(MODEL_PATH), local_files_only=True)
        _recognizer = pipeline("automatic-speech-recognition", model=model, tokenizer=processor.tokenizer, feature_extractor=processor.feature_extractor, device=-1)
    return _recognizer

def verify_audio(path, expected, language):
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    from math import gcd
    samples, rate = sf.read(str(path), dtype="float32")
    if samples.ndim != 1 or not np.isfinite(samples).all() or len(samples) == 0:
        raise QualityError("Generated narration contains invalid audio.")
    duration = len(samples) / rate
    if duration >= 28 or duration < .25:
        raise QualityError("Generated sentence may have reached the speech length limit.")
    if float(np.max(np.abs(samples))) < .005:
        raise QualityError("Generated sentence is too quiet to verify.")
    if float(np.mean(np.abs(samples)>=.999))>.01:
        raise QualityError("Generated sentence contains clipped, distorted audio.")
    divisor = gcd(rate, 16000)
    waveform = resample_poly(samples, 16000 // divisor, rate // divisor)
    result = recognizer()({"raw": waveform, "sampling_rate": 16000}, return_timestamps="word", generate_kwargs={"language": LANGUAGES[language], "task": "transcribe", "do_sample": False, "num_beams": 1})
    expected_tokens = tokens(expected, language)
    if language!="en":expected_tokens=list("".join(expected_tokens))
    recognized, times = [], []
    for item in result.get("chunks", []):
        start, end = item.get("timestamp", (None, None))
        if start is None or end is None: continue
        units=tokens(item["text"], language)
        if language!="en":units=list("".join(units))
        for token in units:
            recognized.append(token); times.append((max(0., float(start)), min(duration, float(end))))
    if not recognized or not expected_tokens:
        raise QualityError("Could not recognize this sentence reliably.",{"recognizedText":result.get("text",""),"expected":expected})
    matcher = SequenceMatcher(None, expected_tokens, recognized, autojunk=False)
    mapping, errors, deleted, hard_error = {}, 0, [], False
    for tag, i, j, a, b in matcher.get_opcodes():
        if tag != "equal": errors += max(j-i, b-a)
        if language=="en" and tag!="equal":
            # Allow only near-identical spelling variants, never a missing word,
            # an inserted phrase or a different technical term.
            spelling=tag=="replace" and j-i==b-a and all(SequenceMatcher(None,left,right).ratio()>=.86 for left,right in zip(expected_tokens[i:j],recognized[a:b]))
            if not spelling:hard_error=True
        if tag == "delete": deleted.extend(expected_tokens[i:j])
        for offset in range(j-i):
            if b > a: mapping[i+offset] = min(b-1, a+round(offset*max(0,b-a-1)/max(1,j-i-1)))
    error_rate = errors / len(expected_tokens)
    # ASR is imperfect: tolerate minor recognition variation, never missing runs or endings.
    tail_ok = expected_tokens[-1] == recognized[-1] and (len(expected_tokens)<2 or expected_tokens[-2] in recognized[-4:])
    lost_content=any(len(word)>2 or word in {"no","not"} for word in deleted) if language=="en" else len(deleted)>=4
    if hard_error or error_rate > (.14 if language == "en" else .15) or lost_content or (language=="en" and len(deleted)>=1) or not tail_ok:
        raise QualityError(f"Speech did not match the intended sentence clearly (recognition error {error_rate:.0%}).",{"recognizedText":result.get("text",""),"expected":expected,"errorRate":error_rate,"deleted":deleted,"tailMatches":tail_ok})
    if any(times[index][0]-times[index-1][1]>1.8 for index in range(1,len(times))):
        raise QualityError("Generated sentence has an unnatural pause between words.")
    original_words = expected.split()
    groups, current, first, cursor = [], [], 0, 0
    for word in original_words:
        count = len(tokens(word, language)) if language=="en" else len("".join(tokens(word,language)))
        if current and len(" ".join(current+[word])) > 64:
            groups.append((" ".join(current), first, max(first,cursor-1))); current=[]; first=cursor
        current.append(word); cursor += count
    if current: groups.append((" ".join(current), first, max(first,cursor-1)))
    cues=[]
    for text, first, last in groups:
        matches=[mapping[index] for index in range(first,last+1) if index in mapping]
        if not matches: raise QualityError("Could not align the caption to recognized speech.")
        start=times[min(matches)][0]; end=times[max(matches)][1]
        if end <= start: raise QualityError("Speech timestamps were not reliable.")
        cues.append({"text":text,"start":start,"end":end})
    return {"verified":True,"version":VERSION,"errorRate":error_rate,"durationSeconds":duration,"captions":cues,"recognizedText":result.get("text","")}

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"app"))
from speech_quality import spoken_text,split_narration,verify_audio,QualityError

class QualityTests(unittest.TestCase):
    def test_pronunciation(self):
        self.assertEqual(spoken_text("JavaScript or Python", "en"),"Java script or Python")
        self.assertEqual(spoken_text("API, JSON, MP4 and 8–16 GB.","en"),"A P I, J S O N, M P four and eight to sixteen gigabytes.")
    def test_no_text_lost(self):
        original="An API sends a request. "*30
        chunks=split_narration(original,"en")
        self.assertEqual(" ".join(chunks),original.strip())
        self.assertTrue(all(len(chunk)<=150 for chunk in chunks))
    def test_missing_speech_is_rejected(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"test.wav"
            sf.write(path,np.sin(np.arange(64000)*.04)*.1,16000)
            def recognize(_audio,**_kwargs):
                return {"text":"A system a response.","chunks":[{"text":word,"timestamp":(index*.5,index*.5+.4)} for index,word in enumerate("A system a response".split())]}
            with patch("speech_quality.recognizer",return_value=recognize):
                with self.assertRaises(QualityError):verify_audio(path,"A system returns a response.","en")
    def test_audio_timed_captions(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"test.wav";sf.write(path,np.sin(np.arange(64000)*.04)*.1,16000)
            def recognize(_audio,**_kwargs):
                return {"text":"A clear example helps.","chunks":[{"text":word,"timestamp":(start,end)} for word,start,end in [("A",.3,.4),("clear",.45,.9),("example",1.,1.5),("helps",2.,2.6)]]}
            with patch("speech_quality.recognizer",return_value=recognize):
                result=verify_audio(path,"A clear example helps.","en")
                self.assertEqual(result["captions"],[{"text":"A clear example helps.","start":.3,"end":2.6}])

if __name__=="__main__":unittest.main()

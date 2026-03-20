import ctranslate2
from huggingface_hub import snapshot_download
import os

repo = "ct2fast/nllb-200-distilled-600M"
try:
    print(f"Downloading {repo}...")
    path = snapshot_download(repo)
    print(f"Snapshot path: {path}")
    print(f"Directory contents: {os.listdir(path)}")
    
    # Try to load
    print("Attempting to load translator...")
    translator = ctranslate2.Translator(path, device="cpu")
    print("SUCCESS: Model loaded!")
except Exception as e:
    print(f"FAILURE: {e}")
    import traceback
    traceback.print_exc()

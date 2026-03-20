import ctranslate2
from huggingface_hub import snapshot_download
import os

repos = [
    "michaelf94/nllb-200-distilled-600M-ct2-int8",
    "michaelf94/indictrans2-indic-en-dist-200M-ct2-float16",
    "michaelf94/indictrans2-en-indic-dist-200M-ct2-float16"
]

for repo in repos:
    try:
        print(f"\nChecking {repo}...")
        path = snapshot_download(repo)
        print(f"Snapshot path: {path}")
        # Try to load
        print("Attempting to load translator...")
        translator = ctranslate2.Translator(path, device="cpu")
        print(f"SUCCESS: {repo} loaded!")
    except Exception as e:
        print(f"FAILURE for {repo}: {e}")

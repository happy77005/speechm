import ctranslate2
from huggingface_hub import snapshot_download
import os

repos = [
    "adalat-ai/ct2-rotary-indictrans2-indic-en-dist-200M",
    "adalat-ai/ct2-rotary-indictrans2-en-indic-dist-200M",
    "jncraton/nllb-200-distilled-600M-ct2-int8"
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

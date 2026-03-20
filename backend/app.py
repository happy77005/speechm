import os
import asyncio
import logging
import tempfile
import time
import shutil
import uuid
import threading
import traceback
import subprocess
import base64
import io
from pathlib import Path
from typing import Optional, Dict, Any, List
from collections import deque

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from faster_whisper import WhisperModel
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch
import azure.cognitiveservices.speech as speechsdk
from sarvamai import AsyncSarvamAI
from fpdf import FPDF
import ctranslate2

# --- LOGGING SETUP ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Check for ffmpeg
if not shutil.which("ffmpeg"):
    logger.critical("FFMPEG NOT FOUND! Whisper requires ffmpeg.")

# --- APP INITIALIZATION ---
app = FastAPI(title="Unified Translation & Transcription API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "running", "service": "Transpeech API", "version": "1.0.0"}

# --- WHISPER CONFIGURATION ---
WHISPER_MODEL_SIZE = "openai/whisper-large-v3-turbo" 
whisper_model = None

def load_whisper_model():
    global whisper_model
    if whisper_model is None:
        logger.info(f"Loading Faster Whisper model: {WHISPER_MODEL_SIZE}...")
        try:
             # Auto-detect device
             device = "cuda" if torch.cuda.is_available() else "cpu"
             compute_type = "float16" if device == "cuda" else "int8"
             
             logger.info(f"Using device: {device} with compute_type: {compute_type}")
             
             whisper_model = WhisperModel(
                 WHISPER_MODEL_SIZE, 
                 device=device, 
                 compute_type=compute_type, 
                 cpu_threads=4 if device == "cpu" else 0
             )
             logger.info("Whisper model loaded successfully")
        except Exception as e:
             logger.error(f"Failed to load Whisper model: {e}")
             raise e
    return whisper_model

# --- TRANSLATION MODELS CONFIGURATION ---
# We use CTranslate2 for high-speed inference on Nvidia small compute.
NLLB_CT2_PATH = "ct2fast/nllb-200-distilled-600M"
INDIC_EN_CT2_PATH = "michaelf94/indictrans2-indic-en-dist-200M-ct2-float16"
EN_INDIC_CT2_PATH = "michaelf94/indictrans2-en-indic-dist-200M-ct2-float16"

nllb_translator = None
nllb_tokenizer = None
indic_en_translator = None
indic_en_tokenizer = None
en_indic_translator = None
en_indic_tokenizer = None

TRANS_STATUS = "loading" # loading, ready, error
TRANS_LAST_ERROR = None

def load_translation_models():
    global nllb_translator, nllb_tokenizer, indic_en_translator, indic_en_tokenizer, en_indic_translator, en_indic_tokenizer, TRANS_STATUS, TRANS_LAST_ERROR
    logger.info("Starting optimized translation models load...")
    try:
        # Load NLLB-CT2 for global languages
        nllb_translator = ctranslate2.Translator(NLLB_CT2_PATH, device="cuda" if torch.cuda.is_available() else "cpu")
        nllb_tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
        
        # Load IndicTrans2 for Indian languages
        # Note: We use the distributed (dist) versions for efficiency on small compute
        try:
            indic_en_translator = ctranslate2.Translator(INDIC_EN_CT2_PATH, device="cuda" if torch.cuda.is_available() else "cpu")
            indic_en_tokenizer = AutoTokenizer.from_pretrained("ai4bharat/indictrans2-indic-en-dist-200M", trust_remote_code=True)
            
            en_indic_translator = ctranslate2.Translator(EN_INDIC_CT2_PATH, device="cuda" if torch.cuda.is_available() else "cpu")
            en_indic_tokenizer = AutoTokenizer.from_pretrained("ai4bharat/indictrans2-en-indic-dist-200M", trust_remote_code=True)
            logger.info("IndicTrans2 models loaded successfully")
        except Exception as indic_e:
            logger.warning(f"IndicTrans2 load failed (falling back to NLLB for all): {indic_e}")
        
        TRANS_STATUS = "ready"
        logger.info("Translation engine ready")
    except Exception as e:
        TRANS_STATUS = f"error: {str(e)}"
        TRANS_LAST_ERROR = str(e)
        logger.error(f"Failed to load translation models: {e}")

# Start models loading in background
threading.Thread(target=load_translation_models, daemon=True).start()
threading.Thread(target=load_whisper_model, daemon=True).start()

# --- NLLB JOB QUEUE ---
NLLB_QUEUE = deque()
NLLB_JOBS = {}
NLLB_WORKER_BUSY = False
NLLB_JOB_TTL = 3600
NLLB_MAX_QUEUE = 20
NLLB_MAX_CHARS = 1500

class TranslationRequest(BaseModel):
    text: str
    src_lang: str
    tgt_lang: str

class TranslationResponse(BaseModel):
    job_id: str
    status: str

class TranscriptionResponse(BaseModel):
    text: str
    language: str
    confidence: Optional[float] = None
    duration: Optional[float] = None
    seq_id: Optional[int] = None

class PDFExportRequest(BaseModel):
    original_text: str
    translated_text: Optional[str] = None
    src_lang: str
    tgt_lang: Optional[str] = None
    filename: str

# --- UTILS ---
def convert_to_wav(input_path: str) -> str:
    """Converts audio to WAV 16kHz Mono (Azure's preferred format)"""
    output_path = input_path + ".wav"
    try:
        command = [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1",
            output_path
        ]
        subprocess.run(command, check=True, capture_output=True)
        return output_path
    except Exception as e:
        logger.error(f"FFmpeg conversion failed: {e}")
        raise e

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac", ".mp4", ".mkv", ".mov", ".avi"}

def validate_audio_file(file: UploadFile) -> None:
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid file format")

# --- HYBRID TRANSLATION WORKER ---
INDIC_LANGS = {"te", "hi", "ta", "kn", "ml"}

def run_hybrid_translation(text, src_lang, tgt_lang):
    if TRANS_STATUS != "ready":
        raise Exception(f"Translation Engine not ready (status: {TRANS_STATUS})")

    # Smart Routing logic
    # Use IndicTrans2 if one of the languages is in the Indian list and the other is English
    if (src_lang in INDIC_LANGS and tgt_lang == "en") and indic_en_translator:
        return translate_indic_en(text, src_lang)
    elif (src_lang == "en" and tgt_lang in INDIC_LANGS) and en_indic_translator:
        return translate_en_indic(text, tgt_lang)
    else:
        # Fallback to NLLB-CT2 for everything else (German, Japanese, Mandarin, etc.)
        return translate_nllb_ct2(text, src_lang, tgt_lang)

def translate_nllb_ct2(text, src_lang, tgt_lang):
    # Map to NLLB codes if short codes provided
    lang_map = {
        "te": "tel_Telu", "hi": "hin_Deva", "ta": "tam_Taml", 
        "kn": "kan_Knda", "ml": "mal_Mlym", "en": "eng_Latn",
        "de": "deu_Latn", "ja": "jpn_Jpan", "zh": "zho_Hans"
    }
    src_nllb = lang_map.get(src_lang, src_lang)
    tgt_nllb = lang_map.get(tgt_lang, tgt_lang)

    nllb_tokenizer.src_lang = src_nllb
    source = nllb_tokenizer.convert_ids_to_tokens(nllb_tokenizer.encode(text))
    results = nllb_translator.translate_batch([source], target_prefix=[[tgt_nllb]])
    
    target = results[0].hypotheses[0][1:] # Skip prefix
    return nllb_tokenizer.decode(nllb_tokenizer.convert_tokens_to_ids(target))

def translate_indic_en(text, src_lang):
    # IndicTrans2 mapping
    lang_map = {"te": "tel_Telu", "hi": "hin_Deva", "ta": "tam_Taml", "kn": "kan_Knda", "ml": "mal_Mlym"}
    src_indic = lang_map.get(src_lang, src_lang)
    
    source = indic_en_tokenizer.convert_ids_to_tokens(indic_en_tokenizer.encode(f"{src_indic}: {text}"))
    results = indic_en_translator.translate_batch([source])
    
    target = results[0].hypotheses[0]
    return indic_en_tokenizer.decode(indic_en_tokenizer.convert_tokens_to_ids(target))

def translate_en_indic(text, tgt_lang):
    # IndicTrans2 mapping
    lang_map = {"te": "tel_Telu", "hi": "hin_Deva", "ta": "tam_Taml", "kn": "kan_Knda", "ml": "mal_Mlym"}
    tgt_indic = lang_map.get(tgt_lang, tgt_lang)
    
    source = en_indic_tokenizer.convert_ids_to_tokens(en_indic_tokenizer.encode(f"eng_Latn: {text}"))
    results = en_indic_translator.translate_batch([source], target_prefix=[[tgt_indic]])
    
    target = results[0].hypotheses[0][1:] # Skip prefix
    return en_indic_tokenizer.decode(en_indic_tokenizer.convert_tokens_to_ids(target))

def nllb_worker_loop():
    global NLLB_WORKER_BUSY
    while True:
        try:
            if not NLLB_WORKER_BUSY and NLLB_QUEUE:
                if TRANS_STATUS != "ready":
                    time.sleep(1)
                    continue

                job_id = NLLB_QUEUE.popleft()
                NLLB_WORKER_BUSY = True
                NLLB_JOBS[job_id]["status"] = "running"
                
                try:
                    job = NLLB_JOBS[job_id]
                    NLLB_JOBS[job_id]["result"] = run_hybrid_translation(
                        job["text"], job["src_lang"], job["tgt_lang"]
                    )
                    NLLB_JOBS[job_id]["status"] = "done"
                except Exception as e:
                    NLLB_JOBS[job_id]["status"] = "error"
                    NLLB_JOBS[job_id]["result"] = str(e)
                    logger.error(f"Error processing NLLB job {job_id}: {e}")
                finally:
                    NLLB_WORKER_BUSY = False
            time.sleep(0.2)
        except Exception as e:
            logger.error(f"NLLB Worker loop error: {e}")
            time.sleep(1)

def nllb_cleanup_loop():
    while True:
        try:
            now = time.time()
            for jid in list(NLLB_JOBS.keys()):
                if now - NLLB_JOBS[jid]["created_at"] > NLLB_JOB_TTL:
                    del NLLB_JOBS[jid]
        except Exception:
            pass
        time.sleep(300)

threading.Thread(target=nllb_worker_loop, daemon=True).start()
threading.Thread(target=nllb_cleanup_loop, daemon=True).start()

# --- ENDPOINTS ---

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "whisper": {
            "model": WHISPER_MODEL_SIZE,
            "loaded": whisper_model is not None
        },
        "nllb": {
            "status": TRANS_STATUS,
            "queue_length": len(NLLB_QUEUE),
            "worker_busy": NLLB_WORKER_BUSY,
            "last_error": TRANS_LAST_ERROR
        }
    }

# --- TRANSCRIPTION GUIDANCE ---
# We use targeted "Dictionary Hints" (keywords) to guide Whisper's spelling
# without triggering conversational hallucinations.
LANGUAGE_PROMPTS = {
    "te": "వస్తున్నాయి, విదేశీ, మెరుపులు, ఆరంభంలో, విధ్వంసం, ధన్యవాదాలు, నమస్కారం, ప్రశ్నలు, చర్చ, భారత్.",
    "hi": "नमस्ते, क्या, क्यों, कैसे, धन्यवाद, भारत, समाचार, चर्चा।",
    "ta": "வணக்கம், நன்றி.",
    "kn": "ನಮಸ್ಕಾರ, ಧನ್ಯವಾದಗಳು.",
    "ml": "നമസ്കാരം, നന്ദി.",
    "en": ""
}

# HALLUCINATION BLACKLIST: Filter out common "filler" phrases generated by the model during silence
HALLUCINATION_BLACKLIST = {
    "ఇది తెలుగు సంభాషణ", "ఇది తెలుగు సంభాషణ.", "ధన్యవాదాలు.", "ధన్యవాదಗಳು.", "നന്ദി.", "நன்றி."
}

@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    initial_prompt: Optional[str] = Form(None),
    seq_id: Optional[int] = Form(None)
):
    temp_path = None
    try:
        validate_audio_file(file)
        content = await file.read()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or "audio").suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        model = load_whisper_model()
        logger.info(f"Transcribing {file.filename} | Lang: {language} | Seq: {seq_id}")
        
        # Force empty prompt if not provided to disable all GUIDANCE (best for avoiding loops)
        effective_prompt = initial_prompt if initial_prompt else LANGUAGE_PROMPTS.get(language, "")
        
        segments, info = model.transcribe(
            temp_path, 
            language=language if language else None,
            initial_prompt=effective_prompt,
            vad_filter=True,        
            vad_parameters=dict(min_silence_duration_ms=1000, speech_pad_ms=400), # Stricter VAD
            repetition_penalty=1.3,
            condition_on_previous_text=False,
            beam_size=5,
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0
        )
        
        # Convert segments to list to process and check confidence
        segments_list = list(segments)
        
        # Smart Filter: Check if the result is a common hallucination AND has low confidence
        # Whisper hallucinations usually have very low avg_logprob (e.g. < -1.5)
        filtered_segments = []
        for s in segments_list:
            text = s.text.strip()
            # If the segment is in the blacklist, only keep it if it has decent confidence (>-1.0)
            if text in HALLUCINATION_BLACKLIST and s.avg_logprob < -1.0:
                logger.info(f"Filtered out low-confidence hallucination: '{text}' (conf: {s.avg_logprob})")
                continue
            filtered_segments.append(text)
            
        full_text = " ".join(filtered_segments).strip()
        
        # Extra safety: If the final result exactly matches the prompt (mimicry), clear it
        if full_text == effective_prompt.strip():
            full_text = ""
        
        return TranscriptionResponse(
            text=full_text,
            language=info.language,
            confidence=info.language_probability,
            duration=info.duration,
            seq_id=seq_id
        )

    except Exception as e:
        logger.error(f"Whisper transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)

# --- SPECIALIZED WHISPER ENDPOINTS ---

@app.post("/api/transcribe/azure", response_model=TranscriptionResponse)
async def transcribe_azure(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    initial_prompt: Optional[str] = Form(None)
):
    """Transcribes audio using Azure AI Speech (Whisper model)"""
    key = os.getenv("AZURE_SPEECH_KEY")
    region = os.getenv("AZURE_SPEECH_REGION")

    if not key or not region:
        raise HTTPException(status_code=500, detail="Azure API credentials not configured on server.")

    region = region.lower().replace(" ", "")
    temp_path = None
    wav_path = None
    try:
        validate_audio_file(file)
        content = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or "audio").suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        wav_path = convert_to_wav(temp_path)

        speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
        speech_config.set_service_property(
            name='speech.model',
            value='whisper',
            channel=speechsdk.ServicePropertyChannel.UriQueryParameter
        )

        if language:
            lang_map = {
                "te": "te-IN", "hi": "hi-IN", "en": "en-US", "ta": "ta-IN",
                "kn": "kn-IN", "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN",
                "gu": "gu-IN", "pa": "pa-IN"
            }
            speech_config.speech_recognition_language = lang_map.get(language, language)
            
        if initial_prompt:
            speech_config.set_service_property(
                name='whisper.prompt',
                value=initial_prompt,
                channel=speechsdk.ServicePropertyChannel.UriQueryParameter
            )
        
        audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
        speech_recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

        logger.info(f"Azure (Whisper) Transcribing {file.filename} | Lang: {language}")
        result = speech_recognizer.recognize_once_async().get()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            return TranscriptionResponse(
                text=result.text,
                language=language or "unknown",
                confidence=1.0,
                duration=0.0
            )
        elif result.reason == speechsdk.ResultReason.NoMatch:
            raise HTTPException(status_code=400, detail="Speech could not be recognized.")
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation_details = result.cancellation_details
            error_msg = f"Canceled: {cancellation_details.reason}"
            if cancellation_details.reason == speechsdk.CancellationReason.Error:
                error_msg += f" | Error details: {cancellation_details.error_details}"
            raise HTTPException(status_code=500, detail=error_msg)

    except Exception as e:
        logger.error(f"Azure STT Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in [temp_path, wav_path]:
            if p and os.path.exists(p): os.unlink(p)

@app.post("/api/transcribe/sarvam", response_model=TranscriptionResponse)
async def transcribe_sarvam(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None)
):
    """Transcribes audio using Sarvam AI (Saaras v3)"""
    key = os.getenv("SARVAM_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="Sarvam API key not configured on server.")

    lang_map = {
        "te": "te-IN", "hi": "hi-IN", "en": "en-IN", "ta": "ta-IN",
        "kn": "kn-IN", "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN",
        "gu": "gu-IN", "pa": "pa-IN"
    }
    sarvam_lang = lang_map.get(language, "en-IN")
    
    temp_path = None
    wav_path = None
    try:
        validate_audio_file(file)
        content = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or "audio").suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name
        
        wav_path = convert_to_wav(temp_path)
        with open(wav_path, "rb") as f:
            wav_content = f.read()
        
        client = AsyncSarvamAI(api_subscription_key=key)
        logger.info(f"Sarvam Transcribing {file.filename} | Lang: {sarvam_lang}")
        
        async with client.speech_to_text_streaming.connect(
            model="saaras:v3",
            mode="transcribe",
            language_code=sarvam_lang,
            high_vad_sensitivity=True
        ) as ws:
            chunk_size = 32000
            for i in range(0, len(wav_content), chunk_size):
                chunk = base64.b64encode(wav_content[i:i+chunk_size]).decode("utf-8")
                await ws.transcribe(audio=chunk)
            
            await ws.transcribe(audio="")
            
            full_text = ""
            while True:
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=15.0)
                    if not response: break
                    
                    text_chunk = None
                    if hasattr(response, 'data') and response.data:
                        if hasattr(response.data, 'transcript'): text_chunk = response.data.transcript
                        elif isinstance(response.data, dict): text_chunk = response.data.get('transcript')
                    
                    if not text_chunk:
                        if hasattr(response, 'text'): text_chunk = response.text
                        elif isinstance(response, dict): text_chunk = response.get('text')
                        elif hasattr(response, 'transcript'): text_chunk = response.transcript
                        elif isinstance(response, dict): text_chunk = response.get('transcript')
                    
                    if text_chunk: full_text += text_chunk
                    
                    is_final = getattr(response, 'is_final', False) or (isinstance(response, dict) and response.get('is_final', False))
                    resp_type = getattr(response, 'type', None) or (isinstance(response, dict) and response.get('type'))
                    if is_final or resp_type == 'end': break
                        
                except asyncio.TimeoutError: break
            
            return TranscriptionResponse(
                text=full_text.strip() or "Transcription failed or returned empty.",
                language=language or "unknown",
                confidence=1.0,
                duration=0.0
            )

    except Exception as e:
        logger.error(f"Sarvam STT Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in [temp_path, wav_path]:
            if p and os.path.exists(p):
                try: os.unlink(p)
                except: pass

# --- NLLB ENDPOINTS ---

@app.post("/api/translate", response_model=TranslationResponse)
async def translate_text(req: TranslationRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty input")
    
    if len(req.text) > NLLB_MAX_CHARS:
        raise HTTPException(status_code=400, detail="Text too long")
    
    if len(NLLB_QUEUE) >= NLLB_MAX_QUEUE:
        raise HTTPException(status_code=429, detail="Server busy")
    
    if NLLB_STATUS.startswith("error"):
        raise HTTPException(status_code=500, detail=f"NLLB Model failed to load: {NLLB_STATUS}")
        
    job_id = str(uuid.uuid4())
    NLLB_JOBS[job_id] = {
        "status": "queued",
        "text": req.text,
        "src_lang": req.src_lang,
        "tgt_lang": req.tgt_lang,
        "result": None,
        "created_at": time.time()
    }
    
    NLLB_QUEUE.append(job_id)
    return TranslationResponse(job_id=job_id, status="queued")

@app.get("/api/status/{job_id}")
async def get_translation_status(job_id: str):
    if job_id not in NLLB_JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return NLLB_JOBS[job_id]

@app.post("/api/translate/sarvam")
async def translate_sarvam(req: TranslationRequest):
    """Translates text using Sarvam AI (Mayura v1)"""
    key = os.getenv("SARVAM_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="Sarvam API key not configured on server.")

    lang_map = {
        "te": "te-IN", "hi": "hi-IN", "en": "en-IN", "ta": "ta-IN",
        "kn": "kn-IN", "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN",
        "gu": "gu-IN", "pa": "pa-IN"
    }

    src_lang = lang_map.get(req.src_lang, "en-IN")
    tgt_lang = lang_map.get(req.tgt_lang, "hi-IN")

    try:
        client = AsyncSarvamAI(api_subscription_key=key)
        logger.info(f"Sarvam Translating text | From: {src_lang} To: {tgt_lang}")
        
        response = await client.text.translate(
            input=req.text,
            source_language_code=src_lang,
            target_language_code=tgt_lang,
            model="mayura:v1"
        )
        
        translated_text = ""
        if hasattr(response, 'translated_text'):
            translated_text = response.translated_text
        elif isinstance(response, dict):
            translated_text = response.get('translated_text', '')
            
        return translated_text

    except Exception as e:
        logger.error(f"Sarvam Translation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- PDF EXPORT ENDPOINT ---

def get_font_for_lang(lang_code: str):
    """Maps NLLB language codes to font filenames"""
    mapping = {
        "tel_Telu": "NotoSansTelugu-Regular.ttf",
        "te_Telu": "NotoSansTelugu-Regular.ttf",
        "hin_Deva": "NotoSansDevanagari-Regular.ttf",
        "hi_Deva": "NotoSansDevanagari-Regular.ttf",
        "tam_Taml": "NotoSansTamil-Regular.ttf",
        "ta_Taml": "NotoSansTamil-Regular.ttf",
        "kan_Knda": "NotoSansKannada-Regular.ttf",
        "kn_Knda": "NotoSansKannada-Regular.ttf",
        "mal_Mlym": "NotoSansMalayalam-Regular.ttf",
        "ml_Mlym": "NotoSansMalayalam-Regular.ttf",
        "zho_Hans": "NotoSansSC-Regular.ttf",
        "zh": "NotoSansSC-Regular.ttf",
        "jpn_Jpan": "NotoSansJP-Regular.ttf",
        "ja": "NotoSansJP-Regular.ttf",
        "en": "NotoSans-Regular.ttf",
        "eng_Latn": "NotoSans-Regular.ttf"
    }
    return mapping.get(lang_code, "NotoSans-Regular.ttf")

@app.post("/api/export-pdf")
async def export_pdf(req: PDFExportRequest):
    try:
        pdf = FPDF()
        pdf.add_page()
        
        registered_fonts = set()
        def register_font(lang_code):
            font_file = get_font_for_lang(lang_code)
            font_path = os.path.join("fonts", font_file)
            if not os.path.exists(font_path):
                font_path = os.path.join("fonts", "NotoSans-Regular.ttf")
            
            font_name = f"Font_{lang_code}"
            if font_name not in registered_fonts:
                pdf.add_font(font_name, "", font_path)
                registered_fonts.add(font_name)
            return font_name

        english_font = register_font("en")
        pdf.set_font(english_font, size=18)
        pdf.cell(0, 10, "Transcription & Translation", ln=True)
        pdf.set_font(english_font, size=10)
        pdf.cell(0, 10, f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}", ln=True)
        pdf.ln(5)

        pdf.set_font(english_font, size=12)
        pdf.cell(0, 10, "Original Transcript:", ln=True)
        
        src_font = register_font(req.src_lang)
        pdf.set_font(src_font, size=12)
        if req.src_lang != "en":
            try: pdf.set_text_shaping(True)
            except: pass
        else:
            try: pdf.set_text_shaping(False)
            except: pass
            
        pdf.multi_cell(0, 10, req.original_text)
        pdf.ln(10)

        if req.translated_text and req.tgt_lang:
            pdf.set_font(english_font, size=12)
            pdf.cell(0, 10, "Translation:", ln=True)
            
            tgt_font = register_font(req.tgt_lang)
            pdf.set_font(tgt_font, size=12)
            if req.tgt_lang != "en":
                try: pdf.set_text_shaping(True)
                except: pass
            else:
                try: pdf.set_text_shaping(False)
                except: pass
                
            pdf.multi_cell(0, 10, req.translated_text)

        pdf_bytes = bytes(pdf.output(dest="S"))
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={req.filename}"
            }
        )
    except Exception as e:
        logger.error(f"PDF Export failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)


// Map from Whisper output (ISO 639-1 mostly) to NLLB input (FLORES-200)
// This must cover the languages we expect or default gracefully.

export const WHISPER_TO_NLLB: { [key: string]: string } = {
    "en": "eng_Latn", "es": "spa_Latn", "fr": "fra_Latn", "de": "deu_Latn",
    "it": "ita_Latn", "pt": "por_Latn", "ru": "rus_Cyrl", "zh": "zho_Hans",
    "ja": "jpn_Jpan", "ko": "kor_Hang", "hi": "hin_Deva", "ar": "ara_Arab",
    "bn": "ben_Beng", "ur": "urd_Arab", "ta": "tam_Taml", "te": "tel_Telu",
    "tr": "tur_Latn", "vi": "vie_Latn", "nl": "nld_Latn", "pl": "pol_Latn",
    "sv": "swe_Latn", "id": "ind_Latn", "uk": "ukr_Cyrl", "fa": "pes_Arab",
    // Aliases for occasionally weird detections
    "chinese": "zho_Hans", "hindi": "hin_Deva"
};

export const NLLB_TO_SARVAM: { [key: string]: string } = {
    "eng_Latn": "en",
    "hin_Deva": "hi",
    "tel_Telu": "te",
    "tam_Taml": "ta",
    "kan_Knda": "kn",
    "mal_Mlym": "ml",
    "ben_Beng": "bn",
    "mar_Deva": "mr",
    "guj_Gujr": "gu",
    "pan_Guru": "pa"
};

// Initial prompts to guide Whisper towards the correct script
const INITIAL_PROMPTS: { [key: string]: string } = {
    "te": "నమస్కారం, ఇది తెలుగు సంభాషణ.",
    "hi": "नमस्ते, यह हिंदी बातचीत है.",
    "ta": "வணக்கம், இது தமிழ் பேச்சு.",
    "kn": "ನಮಸ್ಕಾರ, ఇది ಕನ್ನಡ ಸಂభాಷಣೆ.",
    "ml": "നമസ്കാരം, ఇది മലയാളം సంഭാഷണമാണ്.",
    "en": "Hello, this is English speech."
};

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:7860";
const WHISPER_API_URL = BASE_URL;
const NLLB_API_URL = BASE_URL;

export interface TranscriptionResponse {
    text: string;
    language: string;
    confidence?: number;
    duration?: number;
    seq_id?: number;
}

export interface TranslationResponse {
    job_id?: string;
    status?: string;
    result?: string;
}

/**
 * Directly calls the Whisper Space API
 */
export async function transcribeAudioDirect(audioBlob: Blob, language?: string, signal?: AbortSignal, prompt?: string, seqId?: number): Promise<TranscriptionResponse> {
    const formData = new FormData();
    // Name must match what the FastAPI expects: currently "file"
    formData.append('file', audioBlob, 'recording.webm');

    // Hint the language to improved mixed-speech accuracy
    if (language) {
        formData.append('language', language);

        // Construct prompt: Static Hint + Dynamic Context
        let finalPrompt = "";

        // 1. Start with the language-specific script hint (e.g. "Namaskaram...")
        if (INITIAL_PROMPTS[language]) {
            finalPrompt += INITIAL_PROMPTS[language];
        }

        // 2. Append the dynamic context from previous chunks
        if (prompt) {
            // Add a space if we already have some prompt content
            finalPrompt += (finalPrompt ? " " : "") + prompt;
        }

        if (finalPrompt) {
            formData.append('initial_prompt', finalPrompt);
        }
    } else if (prompt) {
        // Fallback if no language selected but prompt exists (Context carry-over for auto-detect)
        formData.append('initial_prompt', prompt);
    }

    if (seqId !== undefined) {
        formData.append('seq_id', seqId.toString());
    }

    const response = await fetch(`${WHISPER_API_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
        signal
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Whisper Error: ${response.status} - ${errText}`);
    }

    return response.json();
}

/**
 * Calls the Whisper API via Azure AI Speech
 */
export async function transcribeAudioAzure(audioBlob: Blob, language?: string, signal?: AbortSignal, prompt?: string): Promise<TranscriptionResponse> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    if (language) {
        formData.append('language', language);
    }

    if (prompt) {
        formData.append('initial_prompt', prompt);
    }

    const response = await fetch(`${WHISPER_API_URL}/api/transcribe/azure`, {
        method: 'POST',
        body: formData,
        signal
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Azure Whisper Error: ${response.status} - ${errText}`);
    }

    return response.json();
}

/**
 * Calls the Whisper API via Sarvam AI (Saaras v3)
 */
export async function transcribeAudioSarvam(audioBlob: Blob, language?: string, signal?: AbortSignal): Promise<TranscriptionResponse> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    if (language) {
        formData.append('language', language);
    }

    const response = await fetch(`${WHISPER_API_URL}/api/transcribe/sarvam`, {
        method: 'POST',
        body: formData,
        signal
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sarvam AI Error: ${response.status} - ${errText}`);
    }

    return response.json();
}

/**
 * Calls the Sarvam AI Translation API (Mayura v1)
 */
export async function translateTextSarvam(text: string, srcLang: string, tgtLang: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${WHISPER_API_URL}/api/translate/sarvam`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: text,
            source_language: srcLang,
            target_language: tgtLang
        }),
        signal
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sarvam Translation Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.translated_text;
}

/**
 * Directly calls the NLLB Space API (with Polling)
 */
export async function translateTextDirect(text: string, srcLangWhisper: string, tgtLangNLLB: string, signal?: AbortSignal): Promise<string> {
    // 1. Map Source Language
    let srcLangNLLB = WHISPER_TO_NLLB[srcLangWhisper];
    if (!srcLangNLLB) {
        console.warn(`Unknown source language '${srcLangWhisper}', defaulting to English.`);
        srcLangNLLB = 'eng_Latn';
    }

    // 2. Submit Job
    const payload = {
        text: text,
        src_lang: srcLangNLLB,
        tgt_lang: tgtLangNLLB
    };

    const submitResp = await fetch(`${NLLB_API_URL}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
    });

    if (!submitResp.ok) throw new Error(`Translation Submit Error: ${submitResp.status} - ${await submitResp.text()}`);

    const submitData: any = await submitResp.json();

    const jobId = submitData.job_id;

    if (!jobId) throw new Error("No Job ID received from translation service.");

    // 3. Poll for Completion (Max 120s)
    const startTime = Date.now();
    while (Date.now() - startTime < 120000) {
        if (signal?.aborted) {
            throw new Error("Translation cancelled");
        }
        await new Promise(r => setTimeout(r, 1000)); // Wait 1s

        const statusResp = await fetch(`${NLLB_API_URL}/api/status/${jobId}`, { signal });
        if (statusResp.ok) {
            const statusData: TranslationResponse = await statusResp.json();
            if (statusData.status === "done" && statusData.result) {
                return statusData.result;
            } else if (statusData.status === "error") {
                throw new Error(`Translation Failed: ${statusData.result}`);
            }
        }
    }

    throw new Error("Translation timed out.");
}

/**
 * Calls the backend to generate a PDF for multi-language support
 */
export async function exportToPDF(
    originalText: string, 
    translatedText: string | null, 
    srcLang: string, 
    tgtLang: string | null, 
    filename: string
): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            original_text: originalText, 
            translated_text: translatedText, 
            src_lang: srcLang, 
            tgt_lang: tgtLang,
            filename: filename 
        })
    });

    if (!response.ok) {
        throw new Error(`PDF Export Error: ${response.status} - ${await response.text()}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

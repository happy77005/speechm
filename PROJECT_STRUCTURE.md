# Project Structure & Technology Guide

This document clarifies the connections between the project components and provides a primer on the technologies used.

## 🏗️ Architecture Overview

The project is divided into two main areas:

1.  **`frontend/`**: A React-based web application.
2.  **`backend/`**: Source code for the backend services hosted on Hugging Face Spaces (Whisper, NLLB). *Note: This folder was previously named `deployment`.*

### 🔗 Component Connectivity

```mermaid
graph LR
    subgraph Local Machine
        F[Frontend / React]
    end

    subgraph Cloud Service (Hugging Face)
        W[Whisper Space / FastAPI]
        N[NLLB Space / FastAPI]
    end

    F -- Direct API Calls --> W
    F -- Direct API Calls --> N
```

- **Frontend <-> Backend (AI Engines)**: The `frontend` application is directly connected to the Hugging Face Spaces. It sends audio for transcription and text for translation straight to the cloud services. The code for these engines is located in the local `backend/` folder.
- **Independence**: Any previous "gateway" or "proxy" backend is no longer part of the main project flow.

---

## 📄 Understanding `api.ts`

The [api.ts](file:///c:/Users/harip/Downloads/translation/fastapi/main-project/frontend/src/services/api.ts) file is the "communication hub" of the frontend. It handles all network requests.

### Key Responsibilities:
1.  **Language Mapping**: It translates between different language code standards.
    - `WHISPER_TO_NLLB`: Converts Whisper's short codes (e.g., `te`) to NLLB's detailed codes (e.g., `tel_Telu`).
2.  **API URL Configuration**:
    - `USE_LOCAL_BACKEND = false`: This flag controls whether the app talks to a local server or Hugging Face.
3.  **Core Functions**:
    - `transcribeAudioDirect()`: Sends an audio file (Blob) to the Whisper engine.
    - `translateTextDirect()`: Sends text to the NLLB engine and handles **Polling** (checking every second if the long translation task is finished).

---

## ⚛️ React Basics in this Project

React is a library for building User Interfaces using **Components**.

1.  **Components**: Small, reusable blocks of code (like `App.tsx` or buttons).
2.  **State (`useState`)**: How the app "remembers" things (e.g., the current transcript or the selected language).
3.  **Effects (`useEffect`)**: Used for "side effects" like starting a timer or fetching data when a button is clicked.

In this project, React manages the microphone state, displays the live transcript, and handles the language selection dropdowns.

---

## ⚡ Role of FastAPI

**FastAPI** is a modern Python framework used to build APIs. In this project:

1.  **Backend (Cloud AI Engines)**:
    - Each subfolder in the `backend/` directory (e.g., `hf_space_whisper`) contains a FastAPI app.
    - These apps handle the heavy lifting of running AI models (Whisper/NLLB) and serving the results over the internet via Hugging Face Spaces.

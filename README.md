---
title: Transpeech
emoji: 🎙️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Unified Translation Project

This project combines the Whisper transcription service and the NLLB translation service into a single, unified codebase with a central backend.

## 📂 Project Structure

- **`backend/`**: A unified FastAPI server.
  - `app.py`: Contains both Whisper and NLLB services.
  - `requirements.txt`: Combined dependencies for both models.
- **`frontend/`**: The React-based user interface.
  - Configured to point to the central backend at `http://localhost:8000`.

## Running with Docker

You can run the backend service (and eventually the full stack) using Docker:

1.  **Build and Start**:
    ```bash
    docker-compose up --build
    ```
2.  **Model Caching**: The `docker-compose.yml` includes a volume (`hf_cache`) to persist downloaded ML models, so they won't be re-downloaded every time you restart the container.

---

## Technical Details

## 🚀 Getting Started

### 1. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the server:
   ```bash
   python app.py
   ```

### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## 🛠️ Combined API Endpoints
- `GET /health`: Checks the status of both Whisper and NLLB models.
- `POST /api/transcribe`: Transcribes audio files using Whisper.
- `POST /api/translate`: Submits text for translation using NLLB (returns a `job_id`).
- `GET /api/status/{job_id}`: Retrieves the translation result for a given job.

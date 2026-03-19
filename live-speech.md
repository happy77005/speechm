# Live Speech Tracker Implementation Plan

This document outlines the strategy for implementing real-time speech detection using chunking and streaming, integrated with the Hugging Face Whisper backend.

## Architecture
The system will use a **VAD (Voice Activity Detection)** or **Time-Based Chunking** approach to send audio slices to the backend.

### 1. Frontend: `LiveSpeechTracker.tsx`
- **Audio Capture**: Use `MediaRecorder` or `AudioWorklet` to capture audio in 2-3 second chunks.
- **Streaming Logic**: A custom hook `useLiveTranscription` will handle the interval-based POST requests to the `/transcribe` endpoint.
- **State Management**: Progressively append transcribed text to a live view.
- **UI**: A central "Zap" style toggle button in the navigation, a large pulse-button for recording, and a language selector.

### 2. Backend Strategy (8 vCPU Optimized)
- **FastAPI Workers**: Use `uvicorn --workers 4` to bypass the GIL and handle 4 parallel chunks.
- **Inference Concurrency**: Assign 2 vCPUs per Whisper instance to process 4 chunks at once.
- **Sequence IDs**: Every request will include a `seq_id` to ensure text is reassembled in order.

### 3. Frontend Reassembly Logic
- The `useLiveTranscription` hook will gather out-of-order chunks and display them only when the sequence is complete.

## Proposed Changes

### [Component] Navigation & Routing
#### [MODIFY] [TopBar.tsx](file:///G:/web-projects/translation/v2/unified-project/frontend/src/components/TopBar.tsx)
- Add the "Live" toggle button in the middle of the navigation menu.
#### [MODIFY] [App.tsx](file:///G:/web-projects/translation/v2/unified-project/frontend/src/App.tsx)
- Add `'live'` to the view state and render the new component.

### [Component] Live Speech Tracker
#### [NEW] [LiveSpeechTracker.tsx](file:///G:/web-projects/translation/v2/unified-project/frontend/src/components/LiveSpeechTracker.tsx)
- The main UI component for real-time tracking.
#### [NEW] [useLiveTranscription.ts](file:///G:/web-projects/translation/v2/unified-project/frontend/src/hooks/useLiveTranscription.ts)
- Custom hook to manage the `MediaRecorder` lifecycle and API calls.

## Verification Plan
1. **Local Test**: Verify that audio is correctly chunked every 2 seconds.
2. **API Verification**: Ensure the HF Whisper backend returns text for 2-second clips without significant latency.
3. **UI Test**: Verify that text appends correctly in the live view without duplicating existing content.

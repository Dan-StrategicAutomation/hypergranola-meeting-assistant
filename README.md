# HyperGranola - AI Engineer Interview Assistant

**HyperGranola** is a real-time AI Interview Coach app built with **Tauri**, **Rust**, and **React**. It listens to your voice, searches for live context on the web, and provides instant coaching tips using an LLM.

## 🚀 Features

- **🎙️ Real-time STT**: Uses the browser's native Web Speech API (Free, privacy-focused, no external keys).
- **mag_right Live Search**: Scrapes DuckDuckGo for real-time context on technical topics (No API key required).
- **🧠 AI Coach**: Connects to any OpenAI-compatible LLM.
    - **Local**: Works with [Ollama](https://ollama.com/) (e.g., Llama 3).
    - **Cloud**: Works with [OpenRouter](https://openrouter.ai/) or OpenAI.

## 🛠️ Prerequisites

- **Node.js** (v18+)
- **Rust** (latest stable) & Cargo
- **Microphone**: Ensure your system has a working microphone.

## 📦 Setup

1.  **Install Frontend Dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Environment**:
    Navigate to the Tauri backend folder and create your `.env` file.
    ```bash
    cd src-tauri
    cp .env.example .env
    ```

3.  **Edit `.env`**:
    Open `.env` and uncomment the configuration for your preferred LLM provider.
    
    *Example (OpenRouter):*
    ```toml
    LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
    LLM_API_KEY=sk-or-v1-...
    LLM_MODEL=google/gemini-2.0-flash-001
    ```

    *Example (Ollama Local):*
    ```toml
    LLM_API_URL=http://localhost:11434/v1/chat/completions
    LLM_API_KEY=ollama
    LLM_MODEL=llama3
    ```

## 🏃‍♂️ Running the App

Start the development server (Backend + Frontend):

```bash
npm run tauri dev
```

The application window should appear. Speak into your microphone to start the loop!

## 🔧 Architecture

- **Frontend**: React + Vite + TypeScript. Handles Audio capture (Web Speech API).
- **Backend (Rust)**:
    - **Search**: `reqwest` + `scraper` (DuckDuckGo HTML).
    - **LLM**: HTTP Client (`reqwest`) sending standard Chat Completion JSON.
- **IPC**: Tauri Events (`search_results`, `coach_response`) bridge the Rust backend and React frontend.

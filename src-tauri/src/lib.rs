use tauri::Emitter;
use dotenv::dotenv;
use std::env;
use std::sync::{Arc, Mutex};
use reqwest::Client;
use scraper::{Html, Selector};

mod audio;
mod whisper;
mod stt;
mod diarization;

use stt::{SharedSttState, SttState, SttStatus};
use whisper::{ModelSize, get_model_dir, get_model_path};

async fn perform_search(query: &str) -> Result<String, String> {
    println!("Scraping DuckDuckGo for: {}", query);
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post("https://html.duckduckgo.com/html/")
        .form(&[("q", query)])
        .send()
        .await
        .map_err(|e| format!("DDG Request failed: {}", e))?;

    let html_content = res.text().await.map_err(|e| e.to_string())?;
    let document = Html::parse_document(&html_content);
    
    // Selectors
    let result_selector = Selector::parse(".result").unwrap();
    let title_selector = Selector::parse(".result__title .result__a").unwrap();
    let snippet_selector = Selector::parse(".result__snippet").unwrap();

    let mut results = Vec::new();

    for element in document.select(&result_selector).take(3) {
        let title = element.select(&title_selector).next().map(|e| e.text().collect::<String>()).unwrap_or("No Title".into());
        let link = element.select(&title_selector).next().and_then(|e| e.value().attr("href")).unwrap_or("#").to_string();
        let snippet = element.select(&snippet_selector).next().map(|e| e.text().collect::<String>()).unwrap_or("".into());
        
        if !title.is_empty() {
             results.push(format!("[{}]({}) - {}", title.trim(), link, snippet.trim()));
        }
    }

    if results.is_empty() {
        Ok("No results found on DuckDuckGo (scraping might be blocked or parsing failed).".to_string())
    } else {
        Ok(results.join("\n\n"))
    }
}

async fn ask_coach(transcript: &str, context: &str) -> Result<String, String> {
    // Configuration from ENV
    let api_key = env::var("LLM_API_KEY").unwrap_or_default();
    let api_url = env::var("LLM_API_URL").unwrap_or("https://openrouter.ai/api/v1/chat/completions".to_string());
    let model = env::var("LLM_MODEL").unwrap_or("openrouter/google/gemini-2.0-flash-001".to_string());

    println!("Asking Coach via: {} (Model: {})", api_url, model);

    let client = Client::new();
    let prompt = format!(
        "You are an expert AI Interview Coach. 
        Context from Live Search:
        {}
        
        Candidate/Interviewer Transcript:
        {}
        
        Provide a concise, high-level coaching tip or answer.", 
        context, transcript
    );

    let mut request = client
        .post(&api_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt}]
        }));

    // Only add Bearer token if API Key is present (Ollama might not need it)
    if !api_key.is_empty() {
        request = request.bearer_auth(api_key);
    }
    
    // Add OpenRouter specific headers just in case
    if api_url.contains("openrouter.ai") {
        request = request
            .header("HTTP-Referer", "https://hypergranola.app")
            .header("X-Title", "HyperGranola");
    }

    let res = request
        .send()
        .await
        .map_err(|e| format!("LLM Request Failed: {}", e))?;

    let json: serde_json::Value = res.json().await.map_err(|e| format!("Failed to parse LLM JSON: {}", e))?;
    
    // Robust parsing for different providers (OpenAI standard)
    if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
        Ok(content.to_string())
    } else {
        // Fallback for debugging errors
        Err(format!("Unexpected LLM Response: {:?}", json))
    }
}

#[tauri::command]
async fn process_transcript(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    // Load .env
    dotenv().ok();
    
    // 1. Keyword Extraction (Simple Regex replacement for now, or small LLM)
    let query = if text.len() > 10 {
        // Simple heuristic: search for the last sentence
        Some(text.clone()) 
    } else {
        None
    };

    if let Some(q) = query {
        app_handle.emit("search_results", format!("Searching: {}", q)).unwrap();
        
        let search_res = perform_search(&q).await?;
        app_handle.emit("search_results", &search_res).unwrap();

        let coach_res = ask_coach(&text, &search_res).await?;
        app_handle.emit("coach_response", &coach_res).unwrap();
    }
    Ok(())
}

#[tauri::command]
async fn revise_transcript(full_transcript: String) -> Result<String, String> {
    // Configuration from ENV
    let api_key = env::var("LLM_API_KEY").unwrap_or_default();
    let api_url = env::var("LLM_API_URL").unwrap_or("https://openrouter.ai/api/v1/chat/completions".to_string());
    let model = env::var("LLM_MODEL").unwrap_or("google/gemini-2.0-flash-001".to_string());

    println!("Revising full transcript via: {} (Model: {})", api_url, model);

    let client = Client::new();
    let prompt = format!(
        "You are revising a conversation transcript with the benefit of full context. Review the entire conversation and improve the accuracy of earlier transcriptions.

Full conversation transcript:
{}

Return ONLY the corrected, flowing text of the entire conversation. Do not include timestamps, speaker labels, explanations, or any formatting. Just the natural conversation text:",
        full_transcript
    );

    let mut request = client
        .post(&api_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1000,
            "temperature": 0.2
        }));

    // Only add Bearer token if API Key is present
    if !api_key.is_empty() {
        request = request.bearer_auth(api_key);
    }

    // Add OpenRouter specific headers just in case
    if api_url.contains("openrouter.ai") {
        request = request
            .header("HTTP-Referer", "https://hypergranola.app")
            .header("X-Title", "HyperGranola");
    }

    let res = request
        .send()
        .await
        .map_err(|e| format!("Revision Request Failed: {}", e))?;

    let json: serde_json::Value = res.json().await.map_err(|e| format!("Failed to parse revision JSON: {}", e))?;

    // Robust parsing for different providers (OpenAI standard)
    if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
        Ok(content.trim().to_string())
    } else {
        // Fallback - return original transcript if revision fails
        println!("Revision failed, returning original transcript");
        Ok(full_transcript)
    }
}

// ============ STT Commands ============

#[tauri::command]
async fn start_listening(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedSttState>,
) -> Result<(), String> {
    stt::start_stt(app_handle, state.inner().clone()).await
}

#[tauri::command]
fn stop_listening(state: tauri::State<'_, SharedSttState>) -> Result<(), String> {
    stt::stop_stt(state.inner())
}

#[tauri::command]
fn get_stt_status(state: tauri::State<'_, SharedSttState>) -> SttStatus {
    stt::get_stt_status(state.inner())
}

#[tauri::command]
async fn download_model(app_handle: tauri::AppHandle) -> Result<(), String> {
    let model_size = ModelSize::Base;
    let model_dir = get_model_dir()?;
    let model_path = get_model_path(model_size)?;

    // Create directory if it doesn't exist
    std::fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create model directory: {}", e))?;

    if model_path.exists() {
        return Ok(());
    }

    app_handle.emit("model_download_progress", "Starting download...").unwrap();
    println!("Downloading model from: {}", model_size.download_url());

    let client = Client::new();
    let response = client
        .get(model_size.download_url())
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    let _total_size = response.content_length().unwrap_or(0);
    let _downloaded: u64 = 0;

    let mut file = std::fs::File::create(&model_path)
        .map_err(|e| format!("Failed to create model file: {}", e))?;

    use std::io::Write;
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to download: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write model: {}", e))?;

    app_handle.emit("model_download_progress", "Download complete!").unwrap();
    println!("Model downloaded to: {:?}", model_path);

    Ok(())
}

#[tauri::command]
fn check_model_exists() -> bool {
    whisper::model_exists(ModelSize::Base)
}

#[tauri::command]
async fn correct_transcript(text: String, context: Option<String>) -> Result<String, String> {
    // Configuration from ENV
    let api_key = env::var("LLM_API_KEY").unwrap_or_default();
    let api_url = env::var("LLM_API_URL").unwrap_or("https://openrouter.ai/api/v1/chat/completions".to_string());
    let model = env::var("LLM_MODEL").unwrap_or("google/gemini-2.0-flash-001".to_string());

    println!("Correcting transcript with context via: {} (Model: {})", api_url, model);

    let client = Client::new();

    let prompt = if let Some(ctx) = context {
        format!(
            "You are correcting speech-to-text transcriptions in real-time. Use the conversation context to improve accuracy.

Previous conversation context:
{}

Current spoken text to correct: \"{}\"

Return ONLY the corrected version of the spoken text. Do not include any explanations, coaching tips, or additional formatting. Just the corrected text:",
            ctx, text
        )
    } else {
        format!(
            "Correct this spoken text to make it more coherent and grammatically correct. Return ONLY the corrected text, nothing else: \"{}\"",
            text
        )
    };

    let mut request = client
        .post(&api_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 200,
            "temperature": 0.3
        }));

    // Only add Bearer token if API Key is present
    if !api_key.is_empty() {
        request = request.bearer_auth(api_key);
    }

    // Add OpenRouter specific headers just in case
    if api_url.contains("openrouter.ai") {
        request = request
            .header("HTTP-Referer", "https://hypergranola.app")
            .header("X-Title", "HyperGranola");
    }

    let res = request
        .send()
        .await
        .map_err(|e| format!("Correction Request Failed: {}", e))?;

    let json: serde_json::Value = res.json().await.map_err(|e| format!("Failed to parse correction JSON: {}", e))?;

    // Robust parsing for different providers (OpenAI standard)
    if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
        Ok(content.trim().to_string())
    } else {
        // Fallback - return original text if correction fails
        println!("Correction failed, returning original text");
        Ok(text)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(Mutex::new(SttState::default())) as SharedSttState)
        .invoke_handler(tauri::generate_handler![
            process_transcript,
            correct_transcript,
            revise_transcript,
            start_listening,
            stop_listening,
            get_stt_status,
            download_model,
            check_model_exists,
            initialize_diarization,
            start_diarization,
            stop_diarization,
            get_current_speakers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//! Speech-to-Text manager
//! Coordinates audio capture and whisper transcription

use crate::audio::AudioCapture;
use crate::whisper::{ModelSize, WhisperEngine, get_model_path, model_exists};
use ringbuf::HeapProd;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

/// Minimum audio duration to process (in samples at 16kHz)
const MIN_AUDIO_SAMPLES: usize = 16000; // 1 second
/// Maximum audio duration to process at once
const MAX_AUDIO_SAMPLES: usize = 16000 * 10; // 10 seconds

/// Global STT state
pub struct SttState {
    audio_capture: Option<AudioCapture>,
    audio_producer: Option<HeapProd<f32>>,
    whisper: Option<WhisperEngine>,
    is_running: bool,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl Default for SttState {
    fn default() -> Self {
        Self {
            audio_capture: None,
            audio_producer: None,
            whisper: None,
            is_running: false,
            shutdown_tx: None,
        }
    }
}

pub type SharedSttState = Arc<Mutex<SttState>>;

/// Check STT status
pub fn get_stt_status(state: &SharedSttState) -> SttStatus {
    let state = state.lock().unwrap();
    SttStatus {
        model_loaded: state.whisper.is_some(),
        is_listening: state.is_running,
        model_available: model_exists(ModelSize::Base),
    }
}

#[derive(serde::Serialize, Clone)]
pub struct SttStatus {
    pub model_loaded: bool,
    pub is_listening: bool,
    pub model_available: bool,
}

/// Initialize and start STT
pub async fn start_stt(
    app_handle: AppHandle,
    state: SharedSttState,
) -> Result<(), String> {
    let mut stt = state.lock().map_err(|e| e.to_string())?;
    
    if stt.is_running {
        return Err("STT already running".to_string());
    }

    // Load whisper model if not loaded
    if stt.whisper.is_none() {
        let model_path = get_model_path(ModelSize::Small)?;
        if !model_path.exists() {
            return Err("Model not downloaded. Please download the model first.".to_string());
        }
        stt.whisper = Some(WhisperEngine::new(&model_path)?);
    }

    // Initialize audio capture
    let (mut audio_capture, producer) = AudioCapture::new()?;
    audio_capture.start(producer)?;
    
    // Recreate for the processing loop
    let (audio_capture2, producer2) = AudioCapture::new()?;
    stt.audio_capture = Some(audio_capture2);
    stt.audio_producer = Some(producer2);
    
    // Start audio capture with the new producer
    if let Some(producer) = stt.audio_producer.take() {
        if let Some(ref mut capture) = stt.audio_capture {
            capture.start(producer)?;
        }
    }

    stt.is_running = true;

    // Create shutdown channel
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    stt.shutdown_tx = Some(shutdown_tx);

    // Clone what we need for the processing task
    let state_clone = state.clone();
    
    // Drop the lock before spawning
    drop(stt);

    // Spawn transcription loop
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(500));
        
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    // Get audio samples and transcribe
                    let transcript = {
                        let mut stt = match state_clone.lock() {
                            Ok(s) => s,
                            Err(_) => continue,
                        };
                        
                        if !stt.is_running {
                            break;
                        }

                        // Process audio and transcribe
                        if let Some(capture) = &mut stt.audio_capture {
                            let samples = capture.get_samples(MAX_AUDIO_SAMPLES);
                            if samples.len() >= MIN_AUDIO_SAMPLES {
                                if let Some(whisper) = &stt.whisper {
                                    match whisper.transcribe(&samples) {
                                        Ok(text) if !text.is_empty() => Some(text),
                                        Ok(_) => None,
                                        Err(e) => {
                                            eprintln!("Transcription error: {}", e);
                                            None
                                        }
                                    }
                                } else {
                                    None
                                }
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    };

                    // Emit transcript outside the lock
                    if let Some(text) = transcript {
                        println!("Transcript: {}", text);
                        let _ = app_handle.emit("native_transcript", text);
                    }
                }
                _ = shutdown_rx.recv() => {
                    println!("STT shutdown signal received");
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Stop STT
pub fn stop_stt(state: &SharedSttState) -> Result<(), String> {
    let mut stt = state.lock().map_err(|e| e.to_string())?;
    
    if let Some(ref mut capture) = stt.audio_capture {
        capture.stop();
    }
    
    if let Some(tx) = stt.shutdown_tx.take() {
        let _ = tx.try_send(());
    }
    
    stt.is_running = false;
    stt.audio_capture = None;
    
    Ok(())
}


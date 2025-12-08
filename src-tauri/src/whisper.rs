//! Whisper transcription module
//! Handles loading the model and transcribing audio

use std::path::PathBuf;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Whisper model sizes
#[derive(Debug, Clone, Copy)]
pub enum ModelSize {
    #[allow(dead_code)]
    Tiny,   // ~75MB, fastest, lowest quality
    Base,   // ~142MB, good balance
    Small,  // ~466MB, better quality
}

impl ModelSize {
    pub fn filename(&self) -> &'static str {
        match self {
            ModelSize::Tiny => "ggml-tiny.en.bin",
            ModelSize::Base => "ggml-base.en.bin",
            ModelSize::Small => "ggml-small.en.bin",
        }
    }

    pub fn download_url(&self) -> &'static str {
        match self {
            ModelSize::Tiny => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
            ModelSize::Base => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
            ModelSize::Small => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
        }
    }
}

/// Whisper transcription engine
pub struct WhisperEngine {
    ctx: WhisperContext,
}

impl WhisperEngine {
    /// Load whisper model from path
    pub fn new(model_path: &PathBuf) -> Result<Self, String> {
        println!("Loading Whisper model from: {:?}", model_path);
        
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().ok_or("Invalid model path")?,
            WhisperContextParameters::default(),
        )
        .map_err(|e| format!("Failed to load Whisper model: {}", e))?;

        println!("Whisper model loaded successfully");
        Ok(Self { ctx })
    }

    /// Transcribe audio samples (expects 16kHz mono f32 samples)
    pub fn transcribe(&self, samples: &[f32]) -> Result<String, String> {
        if samples.is_empty() {
            return Ok(String::new());
        }

        // Create a new state for this transcription
        let mut state = self.ctx.create_state()
            .map_err(|e| format!("Failed to create whisper state: {}", e))?;

        // Configure transcription parameters
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        
        // Optimize for real-time
        params.set_n_threads(4);
        params.set_language(Some("en"));
        params.set_translate(false);
        params.set_no_context(true);
        params.set_single_segment(true);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        
        // Suppress non-speech tokens
        params.set_suppress_blank(true);
        params.set_suppress_nst(true);

        // Run transcription
        state
            .full(params, samples)
            .map_err(|e| format!("Transcription failed: {}", e))?;

        // Collect results
        let num_segments = state.full_n_segments();

        let mut result = String::new();
        for i in 0..num_segments {
            if let Some(segment) = state.get_segment(i) {
                result.push_str(&format!("{}", segment));
                result.push(' ');
            }
        }

        Ok(result.trim().to_string())
    }
}

/// Get the model directory path
pub fn get_model_dir() -> Result<PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or("Could not find local data directory")?;
    let model_dir = data_dir.join("hypergranola").join("models");
    Ok(model_dir)
}

/// Get the full path for a model
pub fn get_model_path(size: ModelSize) -> Result<PathBuf, String> {
    Ok(get_model_dir()?.join(size.filename()))
}

/// Check if a model exists
pub fn model_exists(size: ModelSize) -> bool {
    if let Ok(path) = get_model_path(size) {
        path.exists()
    } else {
        false
    }
}


/// Speaker Diarization Module
/// Integrates pyannote-rs for multi-speaker identification and segmentation

use tauri::State;

use pyannote_rs::{DiarizationModel, Segment};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;
use whisper_rs::WhisperContext;
use crate::audio::{AudioCapture, WHISPER_SAMPLE_RATE};
use crate::stt::{SttState, SharedSttState};
use std::time::Duration;

/// Speaker diarization configuration
pub struct DiarizationConfig {
    pub model_path: String,
    pub min_speaker_duration: Duration,
    pub max_speakers: usize,
    pub overlap_threshold: f32,
}

/// Speaker information with audio characteristics
#[derive(Debug, Clone)]
pub struct Speaker {
    pub id: String,
    pub label: String,
    pub gender: Option<String>,
    pub characteristics: Vec<String>,
    pub first_detected: Duration,
    pub last_active: Duration,
    pub message_count: usize,
}

/// Enhanced transcription with speaker attribution
#[derive(Debug, Clone)]
pub struct SpeakerAttributedText {
    pub speaker: Speaker,
    pub text: String,
    pub timestamp: Duration,
    pub confidence: f32,
    pub is_question: bool,
}

/// Diarization engine state
pub struct DiarizationEngine {
    model: Arc<Mutex<DiarizationModel>>,
    whisper: Arc<Mutex<WhisperContext>>,
    config: DiarizationConfig,
    active_speakers: Vec<Speaker>,
    last_speaker_change: Duration,
}

impl DiarizationEngine {
    /// Create a new diarization engine
    pub async fn new(
        model_path: &str,
        whisper: Arc<Mutex<WhisperContext>>,
        config: DiarizationConfig,
    ) -> Result<Self, String> {
        // Load the diarization model
        let model = DiarizationModel::load(model_path)
            .await
            .map_err(|e| format!("Failed to load diarization model: {}", e))?;

        Ok(Self {
            model: Arc::new(Mutex::new(model)),
            whisper,
            config,
            active_speakers: Vec::new(),
            last_speaker_change: Duration::from_secs(0),
        })
    }

    /// Process audio samples and return speaker-attributed text
    pub async fn process_audio(
        &mut self,
        audio_samples: &[f32],
        sample_rate: u32,
    ) -> Result<Vec<SpeakerAttributedText>, String> {
        // Convert audio samples to the format expected by pyannote
        let audio_data = self.convert_audio_format(audio_samples, sample_rate)?;

        // Perform speaker diarization
        let segments = self.diarize_audio(&audio_data).await?;

        // Transcribe each speaker segment
        let mut results = Vec::new();

        for segment in segments {
            // Extract audio for this speaker segment
            let segment_audio = self.extract_segment_audio(&audio_data, &segment)?;

            // Transcribe the segment
            let transcription = self.transcribe_segment(&segment_audio).await?;

            // Create or update speaker profile
            let speaker = self.get_or_create_speaker(segment.speaker).await;

            // Determine if this is a question
            let is_question = self.detect_question(&transcription);

            results.push(SpeakerAttributedText {
                speaker,
                text: transcription,
                timestamp: segment.start,
                confidence: segment.confidence,
                is_question,
            });
        }

        // Update speaker activity tracking
        self.update_speaker_activity(&results);

        Ok(results)
    }

    /// Convert audio format for pyannote compatibility
    fn convert_audio_format(
        &self,
        samples: &[f32],
        sample_rate: u32,
    ) -> Result<Vec<f32>, String> {
        // Ensure we have the correct sample rate
        if sample_rate != WHISPER_SAMPLE_RATE {
            return Err(format!(
                "Unsupported sample rate: {}. Expected: {}",
                sample_rate, WHISPER_SAMPLE_RATE
            ));
        }

        // Normalize audio levels
        let mut normalized = samples.to_vec();
        let max_amp = normalized.iter().fold(0.0, |max, &v| max.max(v.abs()));
        if max_amp > 0.0 {
            let scale = 0.95 / max_amp;
            for sample in &mut normalized {
                *sample *= scale;
            }
        }

        Ok(normalized)
    }

    /// Perform speaker diarization on audio data
    async fn diarize_audio(
        &self,
        audio_data: &[f32],
    ) -> Result<Vec<SpeakerSegment>, String> {
        let model = self.model.lock().await;

        // Convert audio to the format expected by pyannote
        let audio_buffer = self.create_audio_buffer(audio_data)?;

        // Run diarization
        let diarization = model.diarize(&audio_buffer)
            .await
            .map_err(|e| format!("Diarization failed: {}", e))?;

        // Process diarization results
        let mut segments = Vec::new();

        for (segment, speaker) in diarization.iter() {
            let duration = segment.duration();
            if duration >= self.config.min_speaker_duration {
                segments.push(SpeakerSegment {
                    speaker: speaker.to_string(),
                    start: Duration::from_secs_f64(segment.start),
                    end: Duration::from_secs_f64(segment.end),
                    duration,
                    confidence: segment.confidence(),
                });
            }
        }

        Ok(segments)
    }

    /// Create audio buffer for pyannote
    fn create_audio_buffer(&self, samples: &[f32]) -> Result<pyannote_rs::AudioBuffer, String> {
        pyannote_rs::AudioBuffer::from_samples(samples, WHISPER_SAMPLE_RATE as i32)
            .map_err(|e| format!("Failed to create audio buffer: {}", e))
    }

    /// Extract audio segment for transcription
    fn extract_segment_audio(
        &self,
        audio_data: &[f32],
        segment: &SpeakerSegment,
    ) -> Result<Vec<f32>, String> {
        let start_sample = (segment.start.as_secs_f64() * WHISPER_SAMPLE_RATE as f64) as usize;
        let end_sample = (segment.end.as_secs_f64() * WHISPER_SAMPLE_RATE as f64) as usize;

        if end_sample > audio_data.len() {
            return Err("Segment exceeds audio data bounds".to_string());
        }

        Ok(audio_data[start_sample..end_sample].to_vec())
    }

    /// Transcribe a speaker segment
    async fn transcribe_segment(
        &self,
        audio_segment: &[f32],
    ) -> Result<String, String> {
        let whisper = self.whisper.lock().await;

        // Create transcription state
        let mut state = whisper.create_state()
            .map_err(|e| format!("Failed to create whisper state: {}", e))?;

        // Set up transcription parameters
        let mut params = whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_translate(false);
        params.set_single_segment(true);

        // Run transcription
        state.full(params, audio_segment)
            .map_err(|e| format!("Transcription failed: {}", e))?;

        // Get the transcription result
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

    /// Get or create speaker profile
    async fn get_or_create_speaker(&mut self, speaker_id: String) -> Speaker {
        // Check if speaker already exists
        if let Some(speaker) = self.active_speakers.iter().find(|s| s.id == speaker_id) {
            return speaker.clone();
        }

        // Create new speaker
        let new_speaker = Speaker {
            id: speaker_id.clone(),
            label: format!("Speaker {}", self.active_speakers.len() + 1),
            gender: None,
            characteristics: Vec::new(),
            first_detected: Duration::from_secs(0),
            last_active: Duration::from_secs(0),
            message_count: 0,
        };

        self.active_speakers.push(new_speaker.clone());
        new_speaker
    }

    /// Update speaker activity tracking
    fn update_speaker_activity(&mut self, results: &[SpeakerAttributedText]) {
        let now = Duration::from_secs(0); // Would use actual timestamp in real implementation

        for result in results {
            if let Some(speaker) = self.active_speakers.iter_mut().find(|s| s.id == result.speaker.id) {
                speaker.last_active = now;
                speaker.message_count += 1;

                // Detect speaker characteristics
                let characteristics = self.detect_speaker_characteristics(&result.text);
                speaker.characteristics.extend(characteristics);
                speaker.characteristics.sort();
                speaker.characteristics.dedup();
            }
        }

        self.last_speaker_change = now;
    }

    /// Detect speaker characteristics from text
    fn detect_speaker_characteristics(&self, text: &str) -> Vec<String> {
        let mut characteristics = Vec::new();
        let lower_text = text.to_lowercase();

        // Message length characteristics
        let word_count = text.split_whitespace().count();
        if word_count < 10 {
            characteristics.push("short_messages".to_string());
        } else if word_count < 30 {
            characteristics.push("medium_messages".to_string());
        } else {
            characteristics.push("long_messages".to_string());
        }

        // Question patterns
        if text.contains('?') {
            characteristics.push("asks_questions".to_string());
            if lower_text.starts_with("how ") {
                characteristics.push("how_questions".to_string());
            } else if lower_text.startsWith("what ") {
                characteristics.push("what_questions".to_string());
            } else if lower_text.startsWith("why ") {
                characteristics.push("why_questions".to_string());
            }
        }

        // Tone and style
        if text.contains('!') {
            characteristics.push("expressive".to_string());
        }
        if lower_text.contains("please") || lower_text.contains("thank") {
            characteristics.push("polite".to_string());
        }

        characteristics
    }

    /// Detect if text is a question
    fn detect_question(&self, text: &str) -> bool {
        text.trim().ends_with('?') ||
        text.to_lowercase().starts_with("how ") ||
        text.to_lowercase().starts_with("what ") ||
        text.to_lowercase().starts_with("why ") ||
        text.to_lowercase().starts_with("when ") ||
        text.to_lowercase().starts_with("where ")
    }
}

/// Speaker segment with timing information
#[derive(Debug, Clone)]
struct SpeakerSegment {
    pub speaker: String,
    pub start: Duration,
    pub end: Duration,
    pub duration: Duration,
    pub confidence: f32,
}

/// Diarization state for integration with STT
pub struct DiarizationState {
    pub engine: Option<DiarizationEngine>,
    pub is_active: bool,
    pub current_speakers: Vec<Speaker>,
}

impl Default for DiarizationState {
    fn default() -> Self {
        Self {
            engine: None,
            is_active: false,
            current_speakers: Vec::new(),
        }
    }
}

pub type SharedDiarizationState = Arc<Mutex<DiarizationState>>;

/// Initialize diarization with STT
#[tauri::command]
pub async fn initialize_diarization(
    stt_state: SharedSttState,
    model_path: &str,
) -> Result<SharedDiarizationState, String> {
    let stt = stt_state.lock().map_err(|e| e.to_string())?;

    // Get whisper engine from STT state
    let whisper = stt.whisper.clone()
        .ok_or("Whisper engine not initialized")?;

    let config = DiarizationConfig {
        model_path: model_path.to_string(),
        min_speaker_duration: Duration::from_millis(500),
        max_speakers: 10,
        overlap_threshold: 0.3,
    };

    let engine = DiarizationEngine::new(model_path, whisper, config).await?;

    let state = DiarizationState {
        engine: Some(engine),
        is_active: false,
        current_speakers: Vec::new(),
    };

    Ok(Arc::new(Mutex::new(state)))
}

/// Start diarization processing
#[tauri::command]
pub async fn start_diarization(
    state: SharedDiarizationState,
) -> Result<(), String> {
    let mut diarization = state.lock().map_err(|e| e.to_string())?;
    diarization.is_active = true;
    Ok(())
}

/// Stop diarization processing
#[tauri::command]
pub fn stop_diarization(
    state: SharedDiarizationState,
) -> Result<(), String> {
    let mut diarization = state.lock().map_err(|e| e.to_string())?;
    diarization.is_active = false;
    Ok(())
}

/// Process audio with diarization
#[tauri::command]
pub async fn process_audio_with_diarization(
    state: SharedDiarizationState,
    audio_samples: &[f32],
    sample_rate: u32,
) -> Result<Vec<SpeakerAttributedText>, String> {
    let mut diarization = state.lock().map_err(|e| e.to_string())?;

    if !diarization.is_active {
        return Err("Diarization not active".to_string());
    }

    let engine = diarization.engine.as_mut()
        .ok_or("Diarization engine not initialized")?;

    engine.process_audio(audio_samples, sample_rate).await
}

/// Get current speakers
#[tauri::command]
pub fn get_current_speakers(
    state: SharedDiarizationState,
) -> Result<Vec<Speaker>, String> {
    let diarization = state.lock().map_err(|e| e.to_string())?;
    Ok(diarization.current_speakers.clone())
}
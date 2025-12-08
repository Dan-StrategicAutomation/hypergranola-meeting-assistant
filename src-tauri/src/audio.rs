//! Audio capture module using cpal
//! Captures microphone input and buffers it for transcription

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use ringbuf::{HeapRb, HeapCons, HeapProd};
use ringbuf::traits::{Split, Consumer, Producer, Observer};
use cpal::Sample;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const WHISPER_SAMPLE_RATE: u32 = 16000;

/// Audio capture state
pub struct AudioCapture {
    stream: Option<Stream>,
    consumer: HeapCons<f32>,
    is_recording: Arc<AtomicBool>,
}

impl AudioCapture {
    /// Create a new audio capture instance
    pub fn new() -> Result<(Self, HeapProd<f32>), String> {
        // Create a ring buffer for audio samples (30 seconds at 16kHz)
        let buffer_size = WHISPER_SAMPLE_RATE as usize * 30;
        let rb = HeapRb::<f32>::new(buffer_size);
        let (producer, consumer) = rb.split();

        Ok((
            Self {
                stream: None,
                consumer,
                is_recording: Arc::new(AtomicBool::new(false)),
            },
            producer,
        ))
    }

    /// Start recording from the default input device
    pub fn start(&mut self, producer: HeapProd<f32>) -> Result<(), String> {
        let host = cpal::default_host();
        
        let device = host
            .default_input_device()
            .ok_or("No input device available")?;

        println!("Using input device: {}", device.name().unwrap_or_default());

        // Get supported config
        let supported_config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;

        println!("Default input config: {:?}", supported_config);

        let sample_format = supported_config.sample_format();
        let config: StreamConfig = supported_config.into();
        let input_sample_rate = config.sample_rate.0;
        let channels = config.channels as usize;

        let is_recording = self.is_recording.clone();
        is_recording.store(true, Ordering::SeqCst);

        // Build the input stream
        let stream = match sample_format {
            SampleFormat::F32 => self.build_stream::<f32>(
                &device,
                &config,
                producer,
                input_sample_rate,
                channels,
            )?,
            SampleFormat::I16 => self.build_stream::<i16>(
                &device,
                &config,
                producer,
                input_sample_rate,
                channels,
            )?,
            SampleFormat::U16 => self.build_stream::<u16>(
                &device,
                &config,
                producer,
                input_sample_rate,
                channels,
            )?,
            _ => return Err(format!("Unsupported sample format: {:?}", sample_format)),
        };

        stream.play().map_err(|e| format!("Failed to play stream: {}", e))?;
        self.stream = Some(stream);

        println!("Audio capture started");
        Ok(())
    }

    fn build_stream<T: cpal::Sample + cpal::SizedSample>(
        &self,
        device: &cpal::Device,
        config: &StreamConfig,
        mut producer: HeapProd<f32>,
        input_sample_rate: u32,
        channels: usize,
    ) -> Result<Stream, String>
    where
        f32: cpal::FromSample<T>,
    {
        let is_recording = self.is_recording.clone();
        let resample_ratio = WHISPER_SAMPLE_RATE as f64 / input_sample_rate as f64;

        let stream = device
            .build_input_stream(
                config,
                move |data: &[T], _: &cpal::InputCallbackInfo| {
                    if !is_recording.load(Ordering::SeqCst) {
                        return;
                    }

                    // Convert to f32 and mono, then resample to 16kHz
                    for (i, frame) in data.chunks(channels).enumerate() {
                        // Mix to mono
                        let sample: f32 = frame
                            .iter()
                            .map(|s| f32::from_sample(*s))
                            .sum::<f32>()
                            / channels as f32;

                        // Simple resampling (for better quality, use a proper resampler)
                        let target_idx = (i as f64 * resample_ratio) as usize;
                        if target_idx < producer.vacant_len() {
                            let _ = producer.try_push(sample);
                        }
                    }
                },
                |err| eprintln!("Audio stream error: {}", err),
                None,
            )
            .map_err(|e| format!("Failed to build input stream: {}", e))?;

        Ok(stream)
    }

    /// Stop recording
    pub fn stop(&mut self) {
        self.is_recording.store(false, Ordering::SeqCst);
        self.stream = None;
        println!("Audio capture stopped");
    }

    /// Check if currently recording
    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::SeqCst)
    }

    /// Get available samples from buffer
    pub fn get_samples(&mut self, max_samples: usize) -> Vec<f32> {
        let available = self.consumer.occupied_len().min(max_samples);
        let mut samples = Vec::with_capacity(available);
        for _ in 0..available {
            if let Some(sample) = self.consumer.try_pop() {
                samples.push(sample);
            }
        }
        samples
    }

    /// Clear the audio buffer
    pub fn clear_buffer(&mut self) {
        while self.consumer.try_pop().is_some() {}
    }
}


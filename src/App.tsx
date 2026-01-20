import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import {
  isTauri,
  getSpeechRecognition,
  isSpeechRecognitionAvailable,
  setBrowserLLMConfig,
  hasBrowserAPIKey,
  browserSearch,
  browserAskCoach,
} from "./utils/environment";
import { conversationStorage } from "./services/conversationStorage";
import { fileExportService } from "./services/fileExportService";
import {
  EnhancedConversationSession,
  EnhancedConversationMessage,
  SessionSummary
} from "./models/conversation";
import MeetingContextForm from "./components/MeetingContextForm";

type Status = "ok" | "warning" | "error";

interface SystemStatus {
  mic: { status: Status; message: string };
  ai: { status: Status; message: string };
  environment: "tauri" | "browser";
}


function App() {
  const [correctedTranscript, setCorrectedTranscript] = useState<{timestamp: Date, speaker: string, text: string}[]>([]);
  const [coachResponse, setCoachResponse] = useState("");
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [modelDownloading, setModelDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [nativeSttActive, setNativeSttActive] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    mic: { status: "warning", message: "Initializing..." },
    ai: { status: "warning", message: "Initializing..." },
    environment: isTauri() ? "tauri" : "browser",
  });
  const [showMeetingContextForm, setShowMeetingContextForm] = useState(false);
  
  // Meeting context state for versatile meeting assistant
  const [meetingContext, setMeetingContext] = useState<{
    title?: string;
    description?: string;
    domain?: string;
    participants?: Array<{ name: string; role: string }>;
    goals?: Array<{ description: string; priority: number }>;
    background?: string;
  } | null>(null);

  // Enhanced conversation tracking state
  const [conversationHistory, setConversationHistory] = useState<EnhancedConversationMessage[]>([]);
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string>('Unknown');
  const [showConversationHistory, setShowConversationHistory] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [currentSession, setCurrentSession] = useState<EnhancedConversationSession | null>(null);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerNameInput, setSpeakerNameInput] = useState('');
  const [lastRevisionTime, setLastRevisionTime] = useState<Date>(new Date());
  // We only keep setters for these states; the raw values are not directly read elsewhere
  const [, setTranscript] = useState("");
  const [, setSearchResults] = useState<string[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const micRetryCount = useRef(0);

  // Process transcript - works in both Tauri and browser mode
  const processTranscript = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 3) return;

    // Add message to conversation tracking system
    const isQuestion = text.endsWith('?') ||
                       text.toLowerCase().includes('how ') ||
                       text.toLowerCase().includes('what ') ||
                       text.toLowerCase().includes('why ');
    conversationStorage.addMessage(text, isQuestion);

    // Get AI-corrected version of the transcript with conversation context
    try {
      let correctedText = text;

      // Build conversation context from recent messages
      const contextMessages = correctedTranscript.slice(-5); // Last 5 messages for context
      const contextString = contextMessages.map(entry =>
        `${entry.speaker}: ${entry.text}`
      ).join('\n');

      if (isTauri()) {
        // Use Tauri backend for correction with context
        correctedText = await invoke<string>("correct_transcript", {
          text,
          context: contextString || null
        });
      } else if (hasBrowserAPIKey()) {
        // Use browser API for correction with context
        const correctionPrompt = contextString
          ? `Conversation context:\n${contextString}\n\nCorrect this new spoken text using the context to improve accuracy. Return ONLY the corrected text: "${text}"`
          : `Correct this spoken text to make it more coherent and grammatically correct. Return ONLY the corrected text: "${text}"`;
        correctedText = await browserAskCoach(correctionPrompt, "");
      }

      // Add to corrected transcript history
      const speaker = currentSession?.speakers.find(s => s.speakerId === 'speaker_1')?.name || 'You';
      setCorrectedTranscript((prev) => {
        const newEntry = {
          timestamp: new Date(),
          speaker,
          text: correctedText
        };

        // If this is a continuation of the same speaker's previous message, combine them
        if (prev.length > 0 && prev[prev.length - 1].speaker === speaker) {
          const lastEntry = prev[prev.length - 1];
          const timeDiff = newEntry.timestamp.getTime() - lastEntry.timestamp.getTime();
          if (timeDiff < 10000) { // Within 10 seconds, likely continuation
            return [
              ...prev.slice(0, -1),
              {
                ...lastEntry,
                text: lastEntry.text + ' ' + correctedText,
                timestamp: newEntry.timestamp // Update timestamp to latest
              }
            ];
          }
        }

        return [...prev, newEntry];
      });
    } catch (error) {
      console.warn("Transcript correction failed, using original:", error);
      const speaker = currentSession?.speakers.find(s => s.speakerId === 'speaker_1')?.name || 'You';
      setCorrectedTranscript((prev) => [...prev, {
        timestamp: new Date(),
        speaker,
        text: text
      }]);
    }

    setTranscript((prev) => prev + "\nYou: " + text);
    setIsProcessing(true);
    setSearchResults((prev) => [...prev, `Searching: ${text}`]);

    try {
      if (isTauri()) {
        await invoke("process_transcript", { text });
      } else {
        // Browser mode - direct API calls
        if (!hasBrowserAPIKey()) {
          setCoachResponse("⚠️ API key required for browser mode.\nClick ⚙️ Settings to configure.");
          setShowSettings(true);
          return;
        }
        const searchRes = await browserSearch(text);
        setSearchResults((prev) => [...prev, searchRes]);
        const coachRes = await browserAskCoach(text, searchRes, meetingContext || undefined);
        setCoachResponse(coachRes);

        // Add AI response to conversation tracking
        conversationStorage.addMessage(coachRes, false);
      }
    } catch (error) {
      console.error("Processing error:", error);
      setCoachResponse(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Initialize conversation storage system
  useEffect(() => {
    // Initialize conversation storage
    const currentSession = conversationStorage.getCurrentSession();
    if (currentSession) {
      setCurrentSession(currentSession);
      setConversationHistory(currentSession.messages);
      setSessionSummaries(currentSession.summaries);
    } else {
      const newSession = conversationStorage.startNewSession('Initial Conversation');
      setCurrentSession(newSession);
    }

    // Load meeting context from storage
    const loadMeetingContext = async () => {
      if (isTauri()) {
        try {
          const context = await invoke<any>("get_current_meeting_context");
          if (context) {
            setMeetingContext(context);
          }
        } catch (error) {
          console.warn("Failed to load meeting context from Tauri:", error);
        }
      } else {
        // Load from browser localStorage if available
        try {
          const savedContext = localStorage.getItem('meetingContext');
          if (savedContext) {
            setMeetingContext(JSON.parse(savedContext));
          }
        } catch (error) {
          console.warn("Failed to load meeting context from localStorage:", error);
        }
      }
    };

    loadMeetingContext();

    // Set up listener for session updates
    const updateInterval = setInterval(() => {
      const session = conversationStorage.getCurrentSession();
      if (session) {
        setConversationHistory([...session.messages]);
        setSessionSummaries([...session.summaries]);
        if (session.speakers.length > 0) {
          setCurrentSpeaker(session.speakers[0].name);
        }
      }
    }, 1000);

    return () => clearInterval(updateInterval);
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    const env = isTauri() ? "tauri" : "browser";
    let unlistenSearch: (() => void) | null = null;
    let unlistenCoach: (() => void) | null = null;
    let unlistenTranscript: (() => void) | null = null;
    let unlistenDownload: (() => void) | null = null;

    // Update AI status based on environment
    if (env === "tauri") {
      setSystemStatus((prev) => ({
        ...prev,
        ai: { status: "ok", message: "Tauri backend ready" },
      }));
    } else {
      const hasKey = hasBrowserAPIKey();
      setSystemStatus((prev) => ({
        ...prev,
        ai: {
          status: hasKey ? "ok" : "warning",
          message: hasKey ? "Browser mode (API key set)" : "Browser mode - needs API key",
        },
      }));
    }

    async function initTauri() {
      // Setup Tauri event listeners
      listen<string>("search_results", (event) => {
        setSearchResults((prev) => [...prev, event.payload]);
      }).then((fn) => { unlistenSearch = fn; });

      listen<string>("meeting_assistant_response", (event) => {
        setCoachResponse(event.payload);
        setIsProcessing(false);
      }).then((fn) => { unlistenCoach = fn; });

      // Listen for native transcripts
      listen<string>("native_transcript", (event) => {
        console.log("Native transcript received:", event.payload);
        if (event.payload.trim()) {
          processTranscript(event.payload);
        }
      }).then((fn) => { unlistenTranscript = fn; });

      // Listen for download progress
      listen<string>("model_download_progress", (event) => {
        setDownloadProgress(event.payload);
      }).then((fn) => { unlistenDownload = fn; });

      // Check if Whisper model is available
      try {
        const modelExists = await invoke<boolean>("check_model_exists");
        if (modelExists) {
          setSystemStatus((prev) => ({
            ...prev,
            mic: { status: "warning", message: "Model ready - click 🎤 to start" },
          }));
          setCoachResponse("🎤 Whisper model ready! Click the microphone button to start listening.");
        } else {
          setSystemStatus((prev) => ({
            ...prev,
            mic: { status: "warning", message: "Model not downloaded" },
          }));
          setCoachResponse("📥 Whisper model not found. Click 'Download Model' in settings to enable voice input.");
          setShowSettings(true);
        }
      } catch (e) {
        console.error("Failed to check model:", e);
        // Fall back to Web Speech API
        initWebSpeechRecognition();
      }
    }

    if (env === "tauri") {
      initTauri();
    } else {
      // Browser mode - use Web Speech API
      if (!isSpeechRecognitionAvailable()) {
        setSystemStatus((prev) => ({
          ...prev,
          mic: { status: "error", message: "Speech API not supported. Try Chrome/Edge." },
        }));
        setCoachResponse("🎤 Microphone unavailable - use the text input below to type your questions.");
      } else {
        initWebSpeechRecognition();
      }
    }

    return () => {
      unlistenSearch?.();
      unlistenCoach?.();
      unlistenTranscript?.();
      unlistenDownload?.();
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      // Stop native STT on cleanup
      if (isTauri() && nativeSttActive) {
        invoke("stop_listening").catch(console.error);
      }
    };
  }, [processTranscript, nativeSttActive]);

  // Toggle native STT
  async function toggleNativeStt() {
    if (!isTauri()) return;

    try {
      if (nativeSttActive) {
        await invoke("stop_listening");
        setNativeSttActive(false);
        setSystemStatus((prev) => ({
          ...prev,
          mic: { status: "warning", message: "Stopped listening" },
        }));
      } else {
        await invoke("start_listening");
        setNativeSttActive(true);
        setSystemStatus((prev) => ({
          ...prev,
          mic: { status: "ok", message: "Listening (Whisper)..." },
        }));
      }
    } catch (e) {
      console.error("STT toggle error:", e);
      setSystemStatus((prev) => ({
        ...prev,
        mic: { status: "error", message: `Error: ${e}` },
      }));
    }
  }

  // Download Whisper model
  async function downloadModel() {
    if (!isTauri()) return;

    setModelDownloading(true);
    setDownloadProgress("Starting download...");

    try {
      await invoke("download_model");
      setSystemStatus((prev) => ({
        ...prev,
        mic: { status: "warning", message: "Model ready - click 🎤 to start" },
      }));
      setCoachResponse("✅ Model downloaded! Click the 🎤 button to start listening.");
    } catch (e) {
      console.error("Download error:", e);
      setDownloadProgress(`Error: ${e}`);
    } finally {
      setModelDownloading(false);
    }
  }

  function initWebSpeechRecognition() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript;
          processTranscript(text);
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
      micRetryCount.current++;

      if (event.error === "not-allowed") {
        setSystemStatus((prev) => ({
          ...prev,
          mic: { status: "error", message: "Microphone permission denied" },
        }));
      } else if (event.error === "no-speech" && micRetryCount.current < 3) {
        // Ignore temporary no-speech errors
      } else {
        setSystemStatus((prev) => ({
          ...prev,
          mic: { status: "warning", message: `Mic error: ${event.error}` },
        }));
      }
    };

    recognition.onend = () => {
      // Auto-restart unless we've had too many errors
      if (micRetryCount.current < 5) {
        try {
          recognition.start();
        } catch {
          console.warn("Failed to restart speech recognition");
        }
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      micRetryCount.current = 0;
      setSystemStatus((prev) => ({
        ...prev,
        mic: { status: "ok", message: "Listening..." },
      }));
    } catch (e) {
      console.error("Failed to start recognition:", e);
      setSystemStatus((prev) => ({
        ...prev,
        mic: { status: "error", message: "Failed to start microphone" },
      }));
    }
  }

  function handleSendInput() {
    if (inputText.trim()) {
      processTranscript(inputText);
      setInputText("");
    }
  }

  function saveApiKey() {
    setBrowserLLMConfig({ apiKey });
    setShowSettings(false);
    setSystemStatus((prev) => ({
      ...prev,
      ai: { status: "ok", message: "Browser mode (API key set)" },
    }));
    setCoachResponse("✅ API key saved. Ready to assist with meetings!");
  }

  const statusIcon = (status: Status) => {
    switch (status) {
      case "ok": return "🟢";
      case "warning": return "🟡";
      case "error": return "🔴";
    }
  };

  // Enhanced conversation management functions
  const startNewConversationSession = () => {
    const newSession = conversationStorage.startNewSession(`Conversation ${new Date().toLocaleString()}`);
    setCurrentSession(newSession);
    setConversationHistory([]);
    setSessionSummaries([]);
    setTranscript("");
    setCorrectedTranscript([]);
    setLastRevisionTime(new Date());
    setSearchResults([]);
    setCoachResponse("🆕 New conversation session started!");
  };

  const exportCurrentSession = (format: 'json' | 'txt' | 'md') => {
    const session = conversationStorage.getCurrentSession();
    if (session) {
      fileExportService.exportSession(session, format);
      setShowExportOptions(false);
    } else {
      setCoachResponse("⚠️ No active session to export");
    }
  };

  const startEditingSpeaker = (speakerId: string, currentName: string) => {
    setEditingSpeaker(speakerId);
    setSpeakerNameInput(currentName);
  };

  const saveSpeakerName = () => {
    if (editingSpeaker && speakerNameInput.trim()) {
      const session = conversationStorage.getCurrentSession();
      if (session) {
        const speaker = session.speakers.find(s => s.speakerId === editingSpeaker);
        if (speaker) {
          speaker.name = speakerNameInput.trim();
          setConversationHistory([...session.messages]); // Trigger re-render
        }
      }
    }
    setEditingSpeaker(null);
    setSpeakerNameInput('');
  };

  const cancelEditingSpeaker = () => {
    setEditingSpeaker(null);
    setSpeakerNameInput('');
  };

  // Periodically revise transcript with accumulated context
  const reviseTranscript = useCallback(async () => {
    if (correctedTranscript.length < 3) return; // Need some conversation history

    const now = new Date();
    const timeSinceLastRevision = now.getTime() - lastRevisionTime.getTime();

    // Only revise every 2 minutes and if we have new messages
    if (timeSinceLastRevision < 120000) return;

    try {
      console.log('Revising transcript with accumulated context...');

      // Get all transcript text for context
      const fullContext = correctedTranscript.map(entry =>
        `${entry.speaker}: ${entry.text}`
      ).join('\n');

      // Revise the entire transcript
      if (isTauri()) {
        const revisedText = await invoke<string>("revise_transcript", {
          fullTranscript: fullContext
        });

        // Update the transcript with the revised version
        // Combine all current text and replace with the improved version
        if (revisedText.trim()) {
          const currentText = correctedTranscript.map(entry => entry.text).join(' ');
          // Only update if the revised version is meaningfully different
          if (revisedText.trim() !== currentText.trim()) {
            setCorrectedTranscript([{
              timestamp: correctedTranscript[0]?.timestamp || new Date(),
              speaker: correctedTranscript[0]?.speaker || 'You',
              text: revisedText.trim()
            }]);
            setLastRevisionTime(now);
            console.log('Transcript revised with improved context');
          }
        }
      }
    } catch (error) {
      console.warn('Transcript revision failed:', error);
    }
  }, [correctedTranscript, lastRevisionTime, isTauri]);

  // Set up periodic transcript revision
  useEffect(() => {
    const revisionInterval = setInterval(() => {
      reviseTranscript();
    }, 120000); // Check every 2 minutes

    return () => clearInterval(revisionInterval);
  }, [reviseTranscript]);

  return (
    <div className="container">
      {/* Enhanced Status Bar with Conversation Features */}
      <div className="status-bar">
        {/* Conversation controls */}
        <button
          className="conversation-btn"
          onClick={() => setShowConversationHistory(!showConversationHistory)}
          title="Show conversation history"
        >
          💬 History
        </button>

        <button
          className="export-btn"
          onClick={() => setShowExportOptions(!showExportOptions)}
          title="Export conversation"
        >
          📥 Export
        </button>

        <button
          className="new-session-btn"
          onClick={startNewConversationSession}
          title="Start new conversation session"
        >
          🆕 New
        </button>

        <button
          className="meeting-context-btn"
          onClick={() => setShowMeetingContextForm(true)}
          title="Set up meeting context"
        >
          📋 Meeting Setup
        </button>

        {/* Current speaker indicator */}
        <span className="status-item speaker-indicator" title={`Current speaker: ${currentSpeaker}`}>
          🎤 {currentSpeaker}
        </span>

        {/* Mic toggle button for native STT */}
        {systemStatus.environment === "tauri" && (
          <button
            className={`mic-toggle ${nativeSttActive ? 'active' : ''}`}
            onClick={toggleNativeStt}
            title={nativeSttActive ? "Stop listening" : "Start listening"}
          >
            {nativeSttActive ? "🎤 Listening" : "🎤 Start"}
          </button>
        )}
        <span className="status-item" title={systemStatus.mic.message}>
          {statusIcon(systemStatus.mic.status)} Mic
        </span>
        <span className="status-item" title={systemStatus.ai.message}>
          {statusIcon(systemStatus.ai.status)} AI
        </span>
        <span className="status-item env-badge">
          {systemStatus.environment === "tauri" ? "🖥️ Desktop" : "🌐 Browser"}
        </span>
        <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>
          ⚙️
        </button>
      </div>

      {/* Export Options Panel */}
      {showExportOptions && (
        <div className="export-panel">
          <h3>Export Conversation</h3>
          <div className="export-options">
            <button onClick={() => exportCurrentSession('json')} title="Export as JSON">
              📄 JSON
            </button>
            <button onClick={() => exportCurrentSession('txt')} title="Export as Text">
              📝 TXT
            </button>
            <button onClick={() => exportCurrentSession('md')} title="Export as Markdown">
              📖 MD
            </button>
          </div>
          <button className="close-btn" onClick={() => setShowExportOptions(false)}>
            Close
          </button>
        </div>
      )}

      {/* Meeting Context Form */}
      {showMeetingContextForm && (
        <MeetingContextForm
          onClose={() => setShowMeetingContextForm(false)}
          onSave={(context) => {
            setShowMeetingContextForm(false);
            setMeetingContext(context as any);
            // Save to browser localStorage in browser mode
            if (!isTauri()) {
              try {
                localStorage.setItem('meetingContext', JSON.stringify(context));
              } catch (error) {
                console.warn("Failed to save meeting context to localStorage:", error);
              }
            }
            setCoachResponse(`✅ Meeting context saved: ${context.title}`);
          }}
        />
      )}

      {/* Conversation History Panel */}
      {showConversationHistory && (
        <div className="conversation-history-panel">
          <div className="history-header">
            <h3>Conversation History</h3>
            <button className="close-btn" onClick={() => setShowConversationHistory(false)}>
              ×
            </button>
          </div>

          <div className="history-content">
            {conversationHistory.length === 0 ? (
              <div className="history-empty">No conversation history yet. Start chatting!</div>
            ) : (
              <div className="history-messages">
                {conversationHistory.map((msg, index) => {
                  const speaker = currentSession?.speakers.find(s => s.speakerId === msg.speakerId) || { name: 'Unknown' };
                  return (
                    <div key={`${msg.id}_${index}`} className={`history-message ${msg.speakerId}`}>
                      <div className="message-header">
                        <span className="message-time">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {editingSpeaker === msg.speakerId ? (
                          <div className="speaker-edit">
                            <input
                              type="text"
                              value={speakerNameInput}
                              onChange={(e) => setSpeakerNameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveSpeakerName();
                                if (e.key === 'Escape') cancelEditingSpeaker();
                              }}
                              autoFocus
                            />
                            <button onClick={saveSpeakerName} className="save-btn">✓</button>
                            <button onClick={cancelEditingSpeaker} className="cancel-btn">✕</button>
                          </div>
                        ) : (
                          <>
                            <span className="message-speaker">{speaker.name}</span>
                            <button
                              className="edit-speaker-btn"
                              onClick={() => startEditingSpeaker(msg.speakerId, speaker.name)}
                              title="Edit speaker name"
                            >
                              ✏️
                            </button>
                          </>
                        )}
                        {msg.isQuestion && <span className="question-badge">❓</span>}
                      </div>
                      <div className="message-content">{msg.content}</div>
                      {msg.keywords && msg.keywords.length > 0 && (
                        <div className="message-keywords">
                          {msg.keywords.map((kw, i) => (
                            <span key={i} className="keyword">{kw}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {sessionSummaries.length > 0 && (
            <div className="history-summaries">
              <h4>Automatic Summaries</h4>
              <div className="summaries-list">
                {sessionSummaries.map((summary, index) => (
                  <div key={index} className="summary-item">
                    <div className="summary-time">
                      {summary.timeRange.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                      {summary.timeRange.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="summary-content">
                      <pre>{summary.content}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <h3>Settings</h3>

          {/* Model Download Section (Tauri only) */}
          {systemStatus.environment === "tauri" && (
            <div className="settings-section">
              <h4>🎤 Voice Recognition (Whisper)</h4>
              <p>Download the Whisper model for offline voice recognition (~142MB):</p>
              <div className="settings-actions">
                <button
                  onClick={downloadModel}
                  disabled={modelDownloading}
                >
                  {modelDownloading ? "Downloading..." : "Download Model"}
                </button>
              </div>
              {downloadProgress && (
                <p className="download-progress">{downloadProgress}</p>
              )}
            </div>
          )}

          {/* API Key Section (Browser mode) */}
          {systemStatus.environment === "browser" && (
            <div className="settings-section">
              <h4>🔑 API Key (Browser Mode)</h4>
              <p>Enter your OpenRouter/OpenAI API key to enable AI:</p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-... or sk-..."
              />
              <div className="settings-actions">
                <button onClick={saveApiKey}>Save</button>
              </div>
            </div>
          )}

          <div className="settings-actions">
            <button onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        <div className="pane transcript">
          <h2>Live Transcript</h2>
          <div className="scroll-area">
            {correctedTranscript.length === 0 ? (
              <div className="placeholder">Speak or type below...</div>
            ) : (
              <div className="transcript-text">
                {correctedTranscript.map((entry, index) => (
                  <span key={index}>
                    {entry.text}
                    {index < correctedTranscript.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="input-area">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your question here..."
              onKeyDown={(e) => e.key === "Enter" && handleSendInput()}
              disabled={isProcessing}
            />
            <button onClick={handleSendInput} disabled={isProcessing || !inputText.trim()}>
              {isProcessing ? "..." : "Send"}
            </button>
          </div>
        </div>

        <div className="pane coach">
           <h2>Meeting Assistant {isProcessing && <span className="loading">thinking...</span>}</h2>
           <div className="coach-content">
             {coachResponse ? (
               <div className="meeting-assistant-response">
                 {coachResponse.split('\n').map((line, i) => {
                   // Headers (##)
                   if (line.startsWith('##')) {
                     return (
                       <h3 key={i} style={{ marginTop: '16px', marginBottom: '8px', color: '#1e40af', fontSize: '16px', fontWeight: 'bold' }}>
                         {line.replace(/^##\s+/, '')}
                       </h3>
                     );
                   }
                   // Bold text (**)
                   else if (line.includes('**')) {
                     const parts = line.split(/(\*\*[^*]+\*\*)/g);
                     return (
                       <div key={i} style={{ marginBottom: '6px', lineHeight: '1.5' }}>
                         {parts.map((part, idx) =>
                           part.startsWith('**') ? (
                             <strong key={idx}>{part.replace(/\*\*/g, '')}</strong>
                           ) : (
                             <span key={idx}>{part}</span>
                           )
                         )}
                       </div>
                     );
                   }
                   // Bullet points (-)
                   else if (line.trim().startsWith('-')) {
                     return (
                       <div key={i} style={{ marginLeft: '16px', marginBottom: '4px', lineHeight: '1.5' }}>
                         {line}
                       </div>
                     );
                   }
                   // Numbered lists
                   else if (/^\d+\./.test(line.trim())) {
                     return (
                       <div key={i} style={{ marginLeft: '16px', marginBottom: '4px', lineHeight: '1.5' }}>
                         {line}
                       </div>
                     );
                   }
                   // Empty lines
                   else if (line.trim() === '') {
                     return <div key={i} style={{ height: '8px' }} />;
                   }
                   // Regular text
                   else {
                     return (
                       <div key={i} style={{ marginBottom: '6px', lineHeight: '1.5' }}>
                         {line}
                       </div>
                     );
                   }
                 })}
               </div>
             ) : (
               <div style={{ color: '#666', fontStyle: 'italic' }}>
                 💬 Ask a question or discuss to get structured meeting assistance...
               </div>
             )}
           </div>
         </div>

        {/* Conversation Summary Panel - moved to right */}
        <div className="pane summary-panel">
          <h2>📊 Meeting Summary</h2>
          <div className="summary-content">
            {sessionSummaries.length === 0 ? (
              <div className="summary-placeholder">
                {conversationHistory.length === 0
                  ? '💬 Start discussing to generate meeting summary...'
                  : '⏳ Summary will appear as conversation progresses...'}
              </div>
            ) : (
              <div className="summary-scroll">
                {sessionSummaries.slice().reverse().map((summary, index) => (
                  <div key={index} className="summary-block">
                    <div className="summary-time">
                      <strong>
                        {summary.timeRange.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} —
                        {summary.timeRange.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </strong>
                    </div>
                    <div className="summary-text">
                      {/* Render summary as formatted markdown-like content */}
                      {summary.content.split('\n').map((line, i) => {
                        if (line.startsWith('##')) {
                          return <h4 key={i} style={{ marginTop: '12px', marginBottom: '6px', color: '#2563eb' }}>{line.replace(/^##\s/, '')}</h4>;
                        } else if (line.startsWith('- ')) {
                          return <div key={i} style={{ marginLeft: '16px', marginBottom: '4px' }}>{line}</div>;
                        } else if (line.startsWith('**') && line.endsWith('**')) {
                          return <div key={i} style={{ fontWeight: 'bold', marginBottom: '4px' }}>{line.replace(/\*\*/g, '')}</div>;
                        } else if (line.trim() === '') {
                          return <div key={i} style={{ height: '8px' }} />;
                        } else {
                          return <div key={i} style={{ marginBottom: '4px', lineHeight: '1.4' }}>{line}</div>;
                        }
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

export default App;

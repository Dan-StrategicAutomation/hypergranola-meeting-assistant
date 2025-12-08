/**
 * Environment detection and browser fallback utilities
 */

// Detect if running inside Tauri
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Check if Web Speech API is available
export function isSpeechRecognitionAvailable(): boolean {
  return typeof window !== 'undefined' && 
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
}

// Get SpeechRecognition constructor
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSpeechRecognition(): any {
  if (!isSpeechRecognitionAvailable()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

// Default LLM configuration for browser mode
const DEFAULT_CONFIG: LLMConfig = {
  apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: '',
  model: 'google/gemini-2.0-flash-001'
};

// Store config in localStorage for persistence
const STORAGE_KEY = 'llmConfig';

export function setBrowserLLMConfig(config: Partial<LLMConfig>) {
  const current = getBrowserLLMConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function getBrowserLLMConfig(): LLMConfig {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_CONFIG };
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : { ...DEFAULT_CONFIG };
}

export function hasBrowserAPIKey(): boolean {
  return getBrowserLLMConfig().apiKey.length > 0;
}

// Browser-based search using a CORS proxy or DuckDuckGo API
export async function browserSearch(query: string): Promise<string> {
  // For browser mode, we'll use a simple approach
  // Note: DuckDuckGo HTML scraping won't work due to CORS
  // Return a placeholder - in production you'd use a CORS-friendly API
  return `[Browser Mode] Search for: "${query}" - Use Tauri app for full search functionality`;
}

// Browser-based LLM call
export async function browserAskCoach(transcript: string, context: string): Promise<string> {
  const config = getBrowserLLMConfig();
  
  if (!config.apiKey) {
    throw new Error('API key not configured. Please enter your API key in settings.');
  }

  const prompt = `You are an expert AI Interview Coach. 
Context from Live Search:
${context}

Candidate/Interviewer Transcript:
${transcript}

Provide a concise, high-level coaching tip or answer.`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`
  };

  // Add OpenRouter specific headers
  if (config.apiUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://hypergranola.app';
    headers['X-Title'] = 'HyperGranola';
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API Error: ${response.status} - ${error}`);
  }

  const json = await response.json();
  
  if (json.choices?.[0]?.message?.content) {
    return json.choices[0].message.content;
  }
  
  throw new Error(`Unexpected LLM response format: ${JSON.stringify(json)}`);
}


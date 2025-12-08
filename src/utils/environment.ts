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

// Browser-based LLM call with meeting context support
export interface MeetingContextData {
  domain?: string;
  title?: string;
  participants?: Array<{ name: string; role: string }>;
  goals?: Array<{ description: string; priority: number }>;
  background?: string;
}

export async function browserAskCoach(
  transcript: string, 
  context: string,
  meetingContext?: MeetingContextData
): Promise<string> {
  const config = getBrowserLLMConfig();
  
  if (!config.apiKey) {
    throw new Error('API key not configured. Please enter your API key in settings.');
  }

  // Build context-aware prompt similar to Tauri backend
  const promptParts: string[] = [];

  // Add domain-specific role
  if (meetingContext?.domain) {
    promptParts.push(getDomainSpecificPrompt(meetingContext.domain));
  } else {
    promptParts.push("You are an expert AI Meeting Assistant specializing in productive meetings, clear communication, and effective decision-making.");
  }

  // Add meeting context if available
  if (meetingContext) {
    const contextSummary = buildMeetingContextSummary(meetingContext);
    if (contextSummary) {
      promptParts.push(`\n\nMeeting Context:\n${contextSummary}`);
    }
  }

  // Add search context if available
  if (context && context.trim()) {
    promptParts.push(`Context from Live Search:\n${context}`);
  }

  // Add transcript
  promptParts.push(`Current Meeting Transcript:\n${transcript}`);

  // Add meeting assistance instructions
  promptParts.push(`
IMPORTANT: You are a MEETING FACILITATOR, not a chatbot. Provide STRUCTURED, ACTIONABLE HELP only.

Format your response using MARKDOWN with clear sections:
- Use ## for main sections
- Use - for bullet points
- Use **bold** for emphasis
- Include numbers for prioritized lists

NEVER:
- Make small talk or casual chat
- Ask conversational follow-ups like "How does that sound?"
- Give generic advice
- Respond with opinion or chat

ALWAYS:
- Extract concrete ACTION ITEMS with ownership
- List KEY DECISIONS made
- Highlight RISKS or CONCERNS
- Provide WEB SEARCH context when relevant (clearly labeled)
- Use domain-specific terminology for this meeting type
- Focus on what NEEDS TO HAPPEN NEXT

Structure your response exactly like this:

## Action Items
- [Clear action] - Owner: [person], Due: [timeframe]

## Key Decisions
- Decision and reasoning

## Discussion Summary
- Main points covered

## Risks/Concerns
- Potential issues to address

## Search Context (if relevant)
- [Only if needed based on transcript]

Keep each section CONCISE and ACTIONABLE. No fluff.`);

  const prompt = promptParts.join("\n\n");

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

// Helper function to get domain-specific prompt
function getDomainSpecificPrompt(domain: string): string {
  const prompts: Record<string, string> = {
    'Technical': `You are an expert AI Meeting Assistant specializing in technical discussions. 
You excel at understanding complex technical topics, identifying potential issues, suggesting best practices, 
and helping teams align on technical decisions. You facilitate clear communication of technical concepts.`,
    
    'Sales': `You are an expert AI Meeting Assistant specializing in sales conversations. 
You help identify client needs, uncover objections, guide negotiations, and ensure key deal points are covered. 
You facilitate effective sales communication and note important action items.`,
    
    'Medical': `You are an expert AI Meeting Assistant specializing in medical discussions and consultations. 
You help ensure important medical information is clearly communicated, facilitate informed discussions, 
and help identify follow-up actions or specialist consultations needed.`,
    
    'Legal': `You are an expert AI Meeting Assistant specializing in legal discussions and case management. 
You help ensure important legal details are documented, identify key precedents or compliance requirements, 
and facilitate clear legal communication.`,
    
    'Educational': `You are an expert AI Meeting Assistant specializing in educational contexts. 
You help clarify learning objectives, identify knowledge gaps, suggest resources, and facilitate effective teaching 
and mentoring discussions.`,
    
    'General': `You are an expert AI Meeting Assistant specializing in productive meetings, clear communication, and effective decision-making.`
  };
  
  return prompts[domain] || prompts['General'];
}

// Helper function to build meeting context summary
function buildMeetingContextSummary(context: MeetingContextData): string {
  const parts: string[] = [];
  
  if (context.title) {
    parts.push(`Meeting: ${context.title}`);
  }
  
  if (context.participants && context.participants.length > 0) {
    parts.push(`Participants: ${context.participants.map(p => `${p.name} (${p.role})`).join(', ')}`);
  }
  
  if (context.goals && context.goals.length > 0) {
    parts.push('Goals:');
    context.goals.forEach(goal => {
      parts.push(`- ${goal.description} (Priority: ${goal.priority}/5)`);
    });
  }
  
  if (context.background) {
    parts.push(`Background: ${context.background}`);
  }
  
  return parts.join('\n');
}


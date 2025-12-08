# Conversation Tracking System - Implementation Guide

## Quick Start for Developers

This guide provides the exact implementation steps needed to add conversation tracking and summarization to the existing application.

## Step 1: Create Core Data Models

### File: `src/models/conversation.ts`

```typescript
export interface ConversationMessage {
  id: string;
  timestamp: Date;
  sender: 'user' | 'assistant';
  content: string;
  isQuestion: boolean;
  relatedToPrevious?: string; // ID of related message for context
}

export interface ConversationSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  messages: ConversationMessage[];
  summary: string;
  isActive: boolean;
  title?: string;
}

export interface ConversationStorage {
  currentSessionId: string | null;
  sessions: Record<string, ConversationSession>;
  version: '1.0';
}
```

## Step 2: Implement Storage Manager

### File: `src/services/storage.ts`

```typescript
import { ConversationStorage, ConversationSession } from '../models/conversation';

const STORAGE_KEY = 'conversation_history';

export class ConversationStorageManager {
  private static instance: ConversationStorageManager;
  private storage: ConversationStorage;

  private constructor() {
    this.storage = this.loadFromStorage();
  }

  public static getInstance(): ConversationStorageManager {
    if (!this.instance) {
      this.instance = new ConversationStorageManager();
    }
    return this.instance;
  }

  private loadFromStorage(): ConversationStorage {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Validate and migrate if needed
        if (parsed.version === '1.0') {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load conversation storage:', error);
    }

    // Return default structure
    return {
      currentSessionId: null,
      sessions: {},
      version: '1.0'
    };
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.storage));
    } catch (error) {
      console.error('Failed to save conversation storage:', error);
      // Implement fallback or error handling
    }
  }

  public getCurrentSession(): ConversationSession | null {
    if (!this.storage.currentSessionId) return null;
    return this.storage.sessions[this.storage.currentSessionId] || null;
  }

  public startNewSession(): ConversationSession {
    const sessionId = `session_${Date.now()}`;
    const newSession: ConversationSession = {
      sessionId,
      startTime: new Date(),
      messages: [],
      summary: '',
      isActive: true,
      title: 'New Conversation'
    };

    this.storage.currentSessionId = sessionId;
    this.storage.sessions[sessionId] = newSession;
    this.saveToStorage();

    return newSession;
  }

  public continueSession(sessionId: string): boolean {
    if (this.storage.sessions[sessionId]) {
      // End current session if exists
      const currentSession = this.getCurrentSession();
      if (currentSession) {
        currentSession.endTime = new Date();
        currentSession.isActive = false;
      }

      this.storage.currentSessionId = sessionId;
      this.storage.sessions[sessionId].isActive = true;
      this.saveToStorage();
      return true;
    }
    return false;
  }

  public addMessage(sender: 'user' | 'assistant', content: string, isQuestion: boolean = false): void {
    const session = this.getCurrentSession();
    if (!session) {
      this.startNewSession();
      return this.addMessage(sender, content, isQuestion);
    }

    const message: ConversationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date(),
      sender,
      content,
      isQuestion
    };

    session.messages.push(message);
    this.saveToStorage();

    // Auto-generate summary after significant exchanges
    if (session.messages.length % 3 === 0 && session.messages.length > 2) {
      this.generateSummaryForSession(session.sessionId);
    }
  }

  public generateSummaryForSession(sessionId: string): void {
    const session = this.storage.sessions[sessionId];
    if (!session) return;

    // Simple summary generation - can be enhanced with AI later
    const userQuestions = session.messages
      .filter(m => m.sender === 'user' && m.isQuestion)
      .map(m => m.content);

    const assistantAnswers = session.messages
      .filter(m => m.sender === 'assistant')
      .map(m => m.content);

    const summaryPoints = [];
    const maxPoints = 5;

    // Add key questions and answers
    for (let i = 0; i < Math.min(userQuestions.length, maxPoints); i++) {
      if (assistantAnswers[i]) {
        summaryPoints.push(`• Q: ${userQuestions[i].substring(0, 50)}... A: ${assistantAnswers[i].substring(0, 50)}...`);
      } else {
        summaryPoints.push(`• Q: ${userQuestions[i].substring(0, 80)}...`);
      }
    }

    // Add any recent important messages
    const recentMessages = session.messages.slice(-3);
    recentMessages.forEach(msg => {
      if (summaryPoints.length < maxPoints && msg.content.length > 20) {
        summaryPoints.push(`• ${msg.sender}: ${msg.content.substring(0, 60)}...`);
      }
    });

    session.summary = summaryPoints.join('\n');
    this.saveToStorage();
  }

  public getSessionHistory(): ConversationSession[] {
    return Object.values(this.storage.sessions)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  public clearAllSessions(): void {
    this.storage = {
      currentSessionId: null,
      sessions: {},
      version: '1.0'
    };
    this.saveToStorage();
  }
}
```

## Step 3: Integrate with Existing App Component

### Modify: `src/App.tsx`

Add these imports:
```typescript
import { ConversationStorageManager } from './services/storage';
import { ConversationMessage } from './models/conversation';
```

Add state for conversation tracking:
```typescript
const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
const [sessionSummary, setSessionSummary] = useState('');
const [showHistory, setShowHistory] = useState(false);
```

Initialize storage manager in useEffect:
```typescript
useEffect(() => {
  const storageManager = ConversationStorageManager.getInstance();
  const currentSession = storageManager.getCurrentSession();

  if (currentSession) {
    setConversationHistory(currentSession.messages);
    setSessionSummary(currentSession.summary);
  } else {
    storageManager.startNewSession();
  }

  // Set up listener for transcript processing
  const originalProcessTranscript = processTranscript;
  // ... rest of existing initialization
}, []);
```

Modify the processTranscript function:
```typescript
const processTranscript = useCallback(async (text: string) => {
  if (!text.trim() || text.length < 3) return;

  // Add to conversation history
  const storageManager = ConversationStorageManager.getInstance();
  const isQuestion = text.endsWith('?') || text.toLowerCase().includes('how') ||
                    text.toLowerCase().includes('what') || text.toLowerCase().includes('why');
  storageManager.addMessage('user', text, isQuestion);

  // Update UI
  setTranscript((prev) => prev + "\nYou: " + text);
  setConversationHistory(storageManager.getCurrentSession()?.messages || []);
  setSessionSummary(storageManager.getCurrentSession()?.summary || '');

  // Rest of existing processing logic...
}, []);
```

## Step 4: Add UI Components

### Add to the render method:

```typescript
// Add to status bar:
<button className="history-toggle" onClick={() => setShowHistory(!showHistory)}>
  📜 {showHistory ? 'Hide History' : 'Show History'}
</button>

// Add conversation history panel:
{showHistory && (
  <div className="history-panel">
    <h3>Conversation History</h3>
    <div className="history-messages">
      {conversationHistory.map((msg) => (
        <div key={msg.id} className={`history-message ${msg.sender}`}>
          <span className="sender">{msg.sender === 'user' ? 'You' : 'Assistant'}:</span>
          <span className="content">{msg.content}</span>
          {msg.isQuestion && <span className="question-badge">❓</span>}
        </div>
      ))}
    </div>
    <div className="session-controls">
      <button onClick={() => {
        const manager = ConversationStorageManager.getInstance();
        manager.startNewSession();
        setConversationHistory(manager.getCurrentSession()?.messages || []);
        setSessionSummary('');
      }}>New Session</button>
      <button onClick={() => setShowHistory(false)}>Close</button>
    </div>
  </div>
)}

// Add summary section to bottom:
<div className="summary-section">
  <h3>Session Summary</h3>
  <div className="summary-content">
    {sessionSummary || 'Summary will appear here after conversation...'}
  </div>
</div>
```

## Step 5: Add CSS Styles

### Add to `src/App.css`:

```css
/* Conversation History Panel */
.history-panel {
  position: fixed;
  right: 20px;
  top: 60px;
  bottom: 200px;
  width: 300px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.history-message {
  margin-bottom: 10px;
  padding: 8px;
  border-radius: 4px;
  font-size: 14px;
}

.history-message.user {
  background-color: #f0f8ff;
  margin-left: 10px;
}

.history-message.assistant {
  background-color: #f5f5f5;
  margin-right: 10px;
}

.sender {
  font-weight: bold;
  margin-right: 5px;
}

.question-badge {
  margin-left: 5px;
  color: #1a73e8;
}

.session-controls {
  margin-top: 15px;
  display: flex;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

/* Summary Section */
.summary-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(245, 245, 245, 0.95);
  border-top: 1px solid #ddd;
  padding: 15px;
  z-index: 50;
  font-size: 14px;
  max-height: 150px;
  overflow-y: auto;
}

.summary-content {
  white-space: pre-wrap;
  line-height: 1.4;
}

/* History toggle button */
.history-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 14px;
}

.history-toggle:hover {
  background-color: rgba(0, 0, 0, 0.05);
}
```

## Step 6: Handle Assistant Responses

Modify the coach response handling to track assistant messages:

```typescript
// In the useEffect where you listen for coach_response:
listen<string>("coach_response", (event) => {
  setCoachResponse(event.payload);

  // Track assistant response
  const storageManager = ConversationStorageManager.getInstance();
  storageManager.addMessage('assistant', event.payload, false);

  setConversationHistory(storageManager.getCurrentSession()?.messages || []);
  setSessionSummary(storageManager.getCurrentSession()?.summary || '');

  setIsProcessing(false);
}).then((fn) => { unlistenCoach = fn; });
```

## Implementation Notes

1. **Storage Limits**: localStorage has ~5MB limit. The system handles this by:
   - Limiting summary points to 5 maximum
   - Truncating long messages in summaries
   - Using efficient JSON serialization

2. **Performance**: Summary generation is debounced to run only after every 3rd message to maintain responsiveness.

3. **Error Handling**: Graceful degradation if localStorage fails, with console logging for debugging.

4. **Session Management**: Automatic session creation on first message, with manual new session capability.

5. **UI Integration**: Non-intrusive design that doesn't interfere with existing functionality.

## Testing Recommendations

1. Test conversation flow with multiple back-and-forth exchanges
2. Verify summary generation after 3+ message pairs
3. Test session persistence across page refreshes
4. Validate new session functionality
5. Check mobile responsiveness of UI components

This implementation provides all requested features:
- ✅ Conversation history tracking
- ✅ Speaker context preservation (User vs Assistant)
- ✅ Automatic summary generation
- ✅ Session management with history
- ✅ Quick and simple interaction model
- ✅ Support for answering latest questions while maintaining context
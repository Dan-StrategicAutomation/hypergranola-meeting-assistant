/**
 * Enhanced Conversation Storage Manager
 *
 * Core service for managing conversation sessions, speaker detection,
 * context compression, and timed summarization.
 */

import {
  EnhancedConversationSession,
  ConversationStorage,
  EnhancedConversationMessage,
  Speaker,
  SessionSummary,
  CompressedMessage,
  SpeakerDetectionResult,
  DEFAULT_CONFIG,
  ConversationSystemConfig
} from '../models/conversation';

// Utility functions
function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
}

function deepClone<T>(obj: T): T {
  // Custom deep clone that properly handles Date objects
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj) as any;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as any;
  }

  const result: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      result[key] = deepClone(obj[key]);
    }
  }
  return result;
}

function calculateWordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

function formatTimeForDisplay(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Performance optimization: debounce function
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  return function(...args: Parameters<T>): void {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => func(...args), wait);
  };
}

export class EnhancedConversationStorageManager {
  private static instance: EnhancedConversationStorageManager;
  private storage: ConversationStorage;
  private config: ConversationSystemConfig;
  private lastSummaryTime: Date | null = null;
  private autoSaveInterval: number | null = null;
  private performanceMetrics: {
    lastSaveTime: number;
    saveCount: number;
    compressionCount: number;
    summaryCount: number;
  } = {
    lastSaveTime: Date.now(),
    saveCount: 0,
    compressionCount: 0,
    summaryCount: 0
  };

  private constructor() {
    this.config = deepClone(DEFAULT_CONFIG);
    this.storage = this.loadFromStorage();
    this.setupAutoSave();
    this.logPerformance('Initialization complete');
  }

  public static getInstance(): EnhancedConversationStorageManager {
    if (!this.instance) {
      this.instance = new EnhancedConversationStorageManager();
    }
    return this.instance;
  }

  private setupAutoSave(): void {
    if (this.config.storage.autoSaveInterval && this.config.storage.autoSaveInterval > 0) {
      // Use debounced save to prevent rapid successive saves
      const debouncedSave = debounce(() => {
        try {
          this.saveToStorage();
          this.performanceMetrics.saveCount++;
        } catch (error) {
          console.error('Auto-save failed:', error);
          this.handleStorageError(error);
        }
      }, 500);

      this.autoSaveInterval = window.setInterval(debouncedSave, this.config.storage.autoSaveInterval);
    }
  }

  private loadFromStorage(): ConversationStorage {
    try {
      const data = localStorage.getItem('enhanced_conversation_storage');
      if (data) {
        const parsed = JSON.parse(data);

        // Validate and migrate if needed
        if (parsed.version === '2.0') {
          // Migrate timestamps from strings to Date objects with safety checks
          if (parsed.sessions) {
            Object.values(parsed.sessions).forEach((session: any) => {
              try {
                // Convert startTime with validation
                if (typeof session.startTime === 'string') {
                  session.startTime = new Date(session.startTime);
                } else if (!(session.startTime instanceof Date)) {
                  session.startTime = new Date();
                }

                // Convert endTime if it exists
                if (session.endTime) {
                  if (typeof session.endTime === 'string') {
                    session.endTime = new Date(session.endTime);
                  } else if (!(session.endTime instanceof Date)) {
                    session.endTime = undefined;
                  }
                }

                // Convert message timestamps
                session.messages?.forEach((msg: any) => {
                  if (typeof msg.timestamp === 'string') {
                    msg.timestamp = new Date(msg.timestamp);
                  } else if (!(msg.timestamp instanceof Date)) {
                    msg.timestamp = new Date();
                  }
                });

                // Convert summary timestamps
                session.summaries?.forEach((sum: any) => {
                  if (typeof sum.timestamp === 'string') {
                    sum.timestamp = new Date(sum.timestamp);
                  } else if (!(sum.timestamp instanceof Date)) {
                    sum.timestamp = new Date();
                  }

                  if (sum.timeRange) {
                    if (typeof sum.timeRange.start === 'string') {
                      sum.timeRange.start = new Date(sum.timeRange.start);
                    } else if (!(sum.timeRange.start instanceof Date)) {
                      sum.timeRange.start = new Date();
                    }

                    if (typeof sum.timeRange.end === 'string') {
                      sum.timeRange.end = new Date(sum.timeRange.end);
                    } else if (!(sum.timeRange.end instanceof Date)) {
                      sum.timeRange.end = new Date();
                    }
                  }
                });
              } catch (migrationError) {
                console.error('Failed to migrate session data:', migrationError);
                // If migration fails, create a clean session
                session.startTime = new Date();
                session.endTime = undefined;
                session.messages = [];
                session.summaries = [];
              }
            });
          }
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
      version: '2.0',
      settings: this.config.storage
    };
  }

  private saveToStorage(): void {
    try {
      // Create a copy with serialized dates - use deepClone that preserves Dates
      const storageCopy = deepClone(this.storage);

      // Create a serialization function to convert Dates to ISO strings
      const serializeDates = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') {
          return obj;
        }

        if (obj instanceof Date) {
          return obj.toISOString();
        }

        if (Array.isArray(obj)) {
          return obj.map(item => serializeDates(item));
        }

        const result: any = {};
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            result[key] = serializeDates(obj[key]);
          }
        }
        return result;
      };

      // Serialize the entire storage structure
      const serializedStorage = serializeDates(storageCopy);

      localStorage.setItem('enhanced_conversation_storage', JSON.stringify(serializedStorage));
    } catch (error) {
      console.error('Failed to save conversation storage:', error);
      // Implement fallback or error handling
      this.handleStorageError(error);
    }
  }

  private handleStorageError(error: unknown): void {
    console.error('Storage error:', error);
    this.logPerformance('Storage error occurred');

    // Implement quota management if needed
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('LocalStorage quota exceeded, cleaning up old sessions');
      this.cleanupOldSessions();
      // Retry save after cleanup
      setTimeout(() => this.saveToStorage(), 1000);
    } else if (error instanceof Error) {
      console.error('Unexpected storage error:', error.message);
    }
  }

  private logPerformance(message: string): void {
    const now = Date.now();
    const sinceLastLog = now - this.performanceMetrics.lastSaveTime;

    console.debug(`[PERF] ${message} - ${sinceLastLog}ms since last operation`);
    console.debug(`[PERF] Stats: ${this.performanceMetrics.saveCount} saves, ${this.performanceMetrics.compressionCount} compressions, ${this.performanceMetrics.summaryCount} summaries`);

    this.performanceMetrics.lastSaveTime = now;
  }

  private checkPerformanceThresholds(): void {
    const session = this.getCurrentSession();
    if (!session) return;

    // Skip heavy operations if we have too many messages
    if (session.messages.length > 200) {
      console.warn('Performance: Large message count detected, skipping some operations');
      return;
    }

    // Check if we're doing too many operations too quickly
    const now = Date.now();
    if (now - this.performanceMetrics.lastSaveTime < 1000 &&
        this.performanceMetrics.saveCount > 5) {
      console.warn('Performance: High operation frequency detected');
    }
  }

  private cleanupOldSessions(): void {
    const sessionIds = Object.keys(this.storage.sessions)
      .sort((a, b) => {
        const aTime = this.storage.sessions[a].startTime.getTime();
        const bTime = this.storage.sessions[b].startTime.getTime();
        return bTime - aTime;
      });

    // Keep only the 10 most recent sessions
    if (sessionIds.length > 10) {
      const sessionsToKeep = sessionIds.slice(0, 10);
      const sessionsToRemove = sessionIds.slice(10);

      sessionsToRemove.forEach(id => {
        delete this.storage.sessions[id];
      });

      // If current session is being removed, clear it
      if (this.storage.currentSessionId && sessionsToRemove.includes(this.storage.currentSessionId)) {
        this.storage.currentSessionId = null;
      }

      this.saveToStorage();
    }
  }

  // ============ Core Public API ============

  public getCurrentSession(): EnhancedConversationSession | null {
    if (!this.storage.currentSessionId) return null;
    return this.storage.sessions[this.storage.currentSessionId] || null;
  }

  public getAllSessions(): EnhancedConversationSession[] {
    return Object.values(this.storage.sessions)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  public startNewSession(title?: string): EnhancedConversationSession {
    // End current session if exists
    const currentSession = this.getCurrentSession();
    if (currentSession) {
      currentSession.endTime = new Date();
      currentSession.isActive = false;
    }

    const sessionId = generateId('session');
    const now = new Date(); // Use single timestamp for consistency

    const newSession: EnhancedConversationSession = {
      sessionId,
      startTime: now,
      messages: [],
      summaries: [],
      speakers: [],
      isActive: true,
      compressedHistory: [],
      title: title || `Conversation ${now.toLocaleString()}`,
      metadata: {
        environment: typeof window !== 'undefined' && (window as any).__TAURI__ ? 'tauri' : 'browser',
        version: '2.0'
      }
    };

    this.storage.currentSessionId = sessionId;
    this.storage.sessions[sessionId] = newSession;
    this.lastSummaryTime = now;

    // Debug: Check if dates are proper Date objects before saving
    console.log('Debug: startTime is Date?', newSession.startTime instanceof Date);
    console.log('Debug: startTime value:', newSession.startTime);

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
      this.storage.sessions[sessionId].endTime = undefined;
      this.lastSummaryTime = new Date();
      this.saveToStorage();
      return true;
    }
    return false;
  }

  public endCurrentSession(): void {
    const session = this.getCurrentSession();
    if (session) {
      session.endTime = new Date();
      session.isActive = false;
      this.storage.currentSessionId = null;
      this.saveToStorage();
    }
  }

  // ============ Message Handling ============

  public addMessage(content: string, isQuestion: boolean = false): EnhancedConversationMessage {
    const session = this.getCurrentSession();
    if (!session) {
      this.startNewSession();
      return this.addMessage(content, isQuestion);
    }

    // Detect speaker for this message
    const speakerResult = this.detectSpeaker(content);
    const speakerId = speakerResult.speakerId;

    // Ensure speaker exists in session
    this.ensureSpeakerExists(session, speakerId, speakerResult);

    // Create message
    const message: EnhancedConversationMessage = {
      id: generateId('msg'),
      timestamp: new Date(),
      speakerId,
      content,
      isQuestion,
      wordCount: calculateWordCount(content),
      keywords: this.extractKeywords(content),
      sentimentScore: this.calculateSentimentScore(content)
    };

    session.messages.push(message);
    this.saveToStorage();

    // Check if we need to generate a summary
    this.checkForSummaryGeneration(session);

    // Check if we need to compress context
    this.checkForContextCompression(session);

    return message;
  }

  private detectSpeaker(content: string): SpeakerDetectionResult {
    const session = this.getCurrentSession();
    if (!session) {
      return {
        speakerId: 'speaker_1',
        confidence: 1.0,
        characteristics: this.analyzeMessageCharacteristics(content),
        isNewSpeaker: true
      };
    }

    const characteristics = this.analyzeMessageCharacteristics(content);

    // If no speakers exist yet, create the first one
    if (session.speakers.length === 0) {
      return {
        speakerId: 'speaker_1',
        confidence: 1.0,
        characteristics,
        isNewSpeaker: true
      };
    }

    // Find the best matching existing speaker
    let bestMatch: { speaker: Speaker; similarity: number } | null = null;

    for (const speaker of session.speakers) {
      const similarity = this.calculateCharacteristicSimilarity(
        speaker.characteristics,
        characteristics
      );

      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { speaker, similarity };
      }
    }

    // If we have a good match (above threshold), use that speaker
    if (bestMatch && bestMatch.similarity >= this.config.speakerDetection.similarityThreshold) {
      return {
        speakerId: bestMatch.speaker.speakerId,
        confidence: bestMatch.similarity,
        characteristics,
        isNewSpeaker: false
      };
    }

    // Check if the last message was recent (within 30 seconds) - likely same speaker
    const lastMessage = session.messages[session.messages.length - 1];
    if (lastMessage) {
      const timeDiff = Date.now() - lastMessage.timestamp.getTime();
      if (timeDiff < 30000) { // 30 seconds
        return {
          speakerId: lastMessage.speakerId,
          confidence: 0.8, // High confidence for time-based match
          characteristics,
          isNewSpeaker: false
        };
      }
    }

    // Create new speaker if no good match found
    const newSpeakerId = `speaker_${session.speakers.length + 1}`;
    return {
      speakerId: newSpeakerId,
      confidence: 1.0,
      characteristics,
      isNewSpeaker: true
    };
  }

  private ensureSpeakerExists(
    session: EnhancedConversationSession,
    speakerId: string,
    detectionResult: SpeakerDetectionResult
  ): void {
    const existingSpeaker = session.speakers.find(s => s.speakerId === speakerId);

    if (!existingSpeaker) {
      const newSpeaker: Speaker = {
        speakerId,
        name: `Speaker ${session.speakers.length + 1}`,
        firstDetected: new Date(),
        messageCount: 0,
        lastActive: new Date(),
        characteristics: detectionResult.characteristics
      };
      session.speakers.push(newSpeaker);
    }

    // Update the speaker
    const speaker = session.speakers.find(s => s.speakerId === speakerId);
    if (speaker) {
      speaker.messageCount++;
      speaker.lastActive = new Date();
      speaker.characteristics = Array.from(new Set([
        ...speaker.characteristics,
        ...detectionResult.characteristics
      ]));
    }
  }

  // ============ Speaker Analysis ============

  private analyzeMessageCharacteristics(message: string): string[] {
    const characteristics = [];
    const lowerMessage = message.toLowerCase();

    // Message length (more stable categories)
    const wordCount = calculateWordCount(message);
    if (wordCount < 10) characteristics.push('short_messages');
    else if (wordCount < 30) characteristics.push('medium_messages');
    else characteristics.push('long_messages');

    // Question patterns (more reliable)
    if (message.includes('?')) {
      characteristics.push('asks_questions');
      if (lowerMessage.startsWith('how ')) characteristics.push('how_questions');
      if (lowerMessage.startsWith('what ')) characteristics.push('what_questions');
      if (lowerMessage.startsWith('why ')) characteristics.push('why_questions');
      if (lowerMessage.startsWith('when ')) characteristics.push('when_questions');
      if (lowerMessage.startsWith('where ')) characteristics.push('where_questions');
    }

    // Tone indicators
    if (message.includes('!')) characteristics.push('expressive');
    if (lowerMessage.includes('please') || lowerMessage.includes('thank')) characteristics.push('polite');
    if (lowerMessage.includes('i think') || lowerMessage.includes('i believe')) characteristics.push('opinionated');

    // Structure
    if (message.split('\n').length > 1) characteristics.push('multi_line');
    if (message.match(/[A-Z]{3,}/)) characteristics.push('uses_capitals'); // acronyms, emphasis

    // Content type hints
    if (lowerMessage.includes('can you') || lowerMessage.includes('could you')) characteristics.push('requests');
    if (lowerMessage.includes('tell me') || lowerMessage.includes('explain')) characteristics.push('seeking_info');

    return characteristics;
  }

  private calculateCharacteristicSimilarity(
    characteristicsA: string[],
    characteristicsB: string[]
  ): number {
    const setA = new Set(characteristicsA);
    const setB = new Set(characteristicsB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  // ============ Context Compression ============

  private checkForContextCompression(session: EnhancedConversationSession): void {
    this.checkPerformanceThresholds();

    if (session.messages.length <= this.config.compression.threshold) {
      return;
    }

    // Only compress if we haven't compressed recently
    const lastCompression = session.compressedHistory.length > 0
      ? session.compressedHistory[session.compressedHistory.length - 1].timeRange.end
      : session.startTime;

    const timeSinceLastCompression = new Date().getTime() - lastCompression.getTime();
    const compressionInterval = this.config.compression.timeGroupingMinutes * 60 * 1000;

    if (timeSinceLastCompression >= compressionInterval) {
      console.debug(`Starting context compression for ${session.messages.length} messages`);
      this.compressContext(session);
      this.performanceMetrics.compressionCount++;
      this.logPerformance('Context compression completed');
    }
  }

  private compressContext(session: EnhancedConversationSession): void {
    const messagesToCompress = [...session.messages]
      .filter(msg => !session.compressedHistory.some(c => c.originalMessageIds.includes(msg.id)))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (messagesToCompress.length < this.config.compression.minMessagesPerGroup) {
      return;
    }

    const compressedGroups = this.groupMessagesForCompression(messagesToCompress);

    compressedGroups.forEach(group => {
      const compressedMessage = this.createCompressedMessage(group);
      session.compressedHistory.push(compressedMessage);
    });

    this.saveToStorage();
  }

  private groupMessagesForCompression(
    messages: EnhancedConversationMessage[]
  ): EnhancedConversationMessage[][] {
    const groups: EnhancedConversationMessage[][] = [];
    let currentGroup: EnhancedConversationMessage[] = [];
    let currentSpeaker: string | null = null;
    let groupStartTime: Date | null = null;

    messages.forEach(message => {
      // Start new group if speaker changes or time gap exceeds threshold
      const timeGapMinutes = groupStartTime
        ? (message.timestamp.getTime() - groupStartTime.getTime()) / (60 * 1000)
        : 0;

      if (!currentSpeaker ||
          message.speakerId !== currentSpeaker ||
          timeGapMinutes > this.config.compression.timeGroupingMinutes) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [message];
        currentSpeaker = message.speakerId;
        groupStartTime = message.timestamp;
      } else {
        currentGroup.push(message);
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups.filter(group => group.length >= this.config.compression.minMessagesPerGroup);
  }

  private createCompressedMessage(
    messages: EnhancedConversationMessage[]
  ): CompressedMessage {
    const startTime = messages[0].timestamp;
    const endTime = messages[messages.length - 1].timestamp;
    const speakerId = messages[0].speakerId;
    const messageIds = messages.map(m => m.id);
    const totalWords = messages.reduce((sum, m) => sum + m.wordCount, 0);
    const originalCount = messages.length;
    const compressedCount = Math.max(1, Math.floor(originalCount * this.config.compression.ratio));

    // Generate summary of the group
    const summary = this.generateCompressedSummary(messages, compressedCount);

    return {
      timeRange: { start: startTime, end: endTime },
      speakerId,
      summary,
      originalMessageIds: messageIds,
      wordCount: totalWords,
      compressionRatio: compressedCount / originalCount
    };
  }

  private generateCompressedSummary(
    messages: EnhancedConversationMessage[],
    maxMessages: number
  ): string {
    // Select key messages: first, last, questions, and longest
    const keyMessages = this.selectKeyMessagesForCompression(messages, maxMessages);

    return keyMessages.map(msg =>
      `${formatTimeForDisplay(msg.timestamp)}: ${msg.content.substring(0, 100)}...`
    ).join(' | ');
  }

  private selectKeyMessagesForCompression(
    messages: EnhancedConversationMessage[],
    maxCount: number
  ): EnhancedConversationMessage[] {
    const keyMessages: EnhancedConversationMessage[] = [];

    // Always include first and last
    if (messages.length > 0) keyMessages.push(messages[0]);
    if (messages.length > 1) keyMessages.push(messages[messages.length - 1]);

    // Include questions
    messages.forEach(msg => {
      if (msg.isQuestion && !keyMessages.includes(msg) && keyMessages.length < maxCount) {
        keyMessages.push(msg);
      }
    });

    // Include longest messages
    const sortedByLength = [...messages].sort((a, b) => b.wordCount - a.wordCount);
    sortedByLength.forEach(msg => {
      if (!keyMessages.includes(msg) && keyMessages.length < maxCount) {
        keyMessages.push(msg);
      }
    });

    return keyMessages.slice(0, maxCount);
  }

  // ============ Summary Generation ============

  private checkForSummaryGeneration(session: EnhancedConversationSession): void {
    this.checkPerformanceThresholds();

    if (!this.lastSummaryTime) {
      this.lastSummaryTime = session.startTime;
      return;
    }

    const now = new Date();
    const minutesSinceLastSummary =
      (now.getTime() - this.lastSummaryTime.getTime()) / (60 * 1000);

    if (minutesSinceLastSummary >= this.config.summarization.intervalMinutes) {
      console.debug(`Generating timed summary for ${minutesSinceLastSummary.toFixed(1)} minutes of conversation`);
      this.generateTimedSummary(session);
      this.lastSummaryTime = now;
      this.performanceMetrics.summaryCount++;
      this.logPerformance('Timed summary generated');
    }
  }

  private generateTimedSummary(session: EnhancedConversationSession): void {
    const timeRange = {
      start: this.lastSummaryTime || session.startTime,
      end: new Date()
    };

    const messagesInPeriod = session.messages.filter(msg =>
      msg.timestamp >= timeRange.start && msg.timestamp <= timeRange.end
    );

    if (messagesInPeriod.length === 0) {
      return;
    }

    const summary = this.createSessionSummary(messagesInPeriod, timeRange);
    session.summaries.push(summary);
    this.saveToStorage();
  }

  private createSessionSummary(
    messages: EnhancedConversationMessage[],
    timeRange: {start: Date, end: Date}
  ): SessionSummary {
    const keyPoints: string[] = [];
    const speakerStatsMap = new Map<string, SpeakerStats>();

    // Initialize speaker stats
    messages.forEach(msg => {
      if (!speakerStatsMap.has(msg.speakerId)) {
        speakerStatsMap.set(msg.speakerId, {
          speakerId: msg.speakerId,
          messageCount: 0,
          wordCount: 0,
          questionsAsked: 0,
          activeTimeMinutes: 0
        });
      }
    });

    // Process messages for key points and stats
    messages.forEach(msg => {
      const stats = speakerStatsMap.get(msg.speakerId);
      if (stats) {
        stats.messageCount++;
        stats.wordCount += msg.wordCount;
        if (msg.isQuestion) stats.questionsAsked++;
      }

      // Generate key points
      if (msg.isQuestion) {
        keyPoints.push(`Q (${formatTimeForDisplay(msg.timestamp)}): ${msg.content.substring(0, this.config.summarization.maxMessageLengthInSummary)}...`);
      } else if (msg.wordCount > 20) {
        keyPoints.push(`• (${formatTimeForDisplay(msg.timestamp)}) ${msg.content.substring(0, this.config.summarization.maxMessageLengthInSummary)}...`);
      }
    });

    // Calculate active time (simple approximation)
    const durationMinutes = (timeRange.end.getTime() - timeRange.start.getTime()) / (60 * 1000);
    speakerStatsMap.forEach(stats => {
      stats.activeTimeMinutes = durationMinutes;
    });

    // Format summary content
    const timePeriod = `${formatTimeForDisplay(timeRange.start)} - ${formatTimeForDisplay(timeRange.end)}`;
    const summaryContent = `Summary ${timePeriod}:\n\n${keyPoints.join('\n')}\n\nSpeaker Activity:\n${Array.from(speakerStatsMap.values()).map(s => `• Speaker ${s.speakerId.split('_')[1]}: ${s.messageCount} messages, ${s.questionsAsked} questions`).join('\n')}`;

    return {
      timestamp: new Date(),
      content: summaryContent,
      timeRange,
      keyPoints: keyPoints.slice(0, this.config.summarization.maxKeyPoints),
      speakerStats: Array.from(speakerStatsMap.values())
    };
  }

  // ============ Utility Methods ============

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - can be enhanced with NLP later
    const words = content.toLowerCase().split(/\s+/);
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);

    return words
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 5);
  }

  private calculateSentimentScore(content: string): number {
    // Simple sentiment analysis - can be enhanced later
    const positiveWords = ['good', 'great', 'excellent', 'wonderful', 'fantastic', 'amazing', 'awesome', 'perfect'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'worst', 'problem', 'issue', 'error', 'fail'];

    const lowerContent = content.toLowerCase();
    let score = 0;

    positiveWords.forEach(word => {
      if (lowerContent.includes(word)) score += 0.1;
    });

    negativeWords.forEach(word => {
      if (lowerContent.includes(word)) score -= 0.1;
    });

    return Math.min(1, Math.max(-1, score)); // Clamp between -1 and 1
  }

  // ============ Cleanup ============

  public cleanup(): void {
    if (this.autoSaveInterval) {
      window.clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }
}

// Singleton instance for easy access
export const conversationStorage = EnhancedConversationStorageManager.getInstance();
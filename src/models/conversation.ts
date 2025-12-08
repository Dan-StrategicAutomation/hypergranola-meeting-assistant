/**
 * Enhanced Conversation Tracking System - Data Models
 *
 * This file contains all the TypeScript interfaces and data structures
 * for the enhanced conversation tracking system with multi-speaker support,
 * context compression, timed summarization, and file export capabilities.
 */

// Basic message interface with enhanced metadata
export interface EnhancedConversationMessage {
  id: string;
  timestamp: Date;
  speakerId: string;
  content: string;
  isQuestion: boolean;
  wordCount: number;
  sentimentScore?: number;
  keywords?: string[];
  originalContent?: string; // For compressed messages
}

// Speaker representation with characteristic tracking
export interface Speaker {
  speakerId: string;
  name: string;
  firstDetected: Date;
  messageCount: number;
  lastActive: Date;
  characteristics: string[];
  displayName?: string; // User-assigned name
}

// Session summary with timing information
export interface SessionSummary {
  timestamp: Date;
  content: string;
  timeRange: {
    start: Date;
    end: Date;
  };
  keyPoints: string[];
  speakerStats: SpeakerStats[];
}

// Speaker statistics for summaries
export interface SpeakerStats {
  speakerId: string;
  messageCount: number;
  wordCount: number;
  questionsAsked: number;
  activeTimeMinutes: number;
}

// Compressed message representation for context optimization
export interface CompressedMessage {
  timeRange: {
    start: Date;
    end: Date;
  };
  speakerId: string;
  summary: string;
  originalMessageIds: string[];
  wordCount: number;
  compressionRatio: number;
}

// Complete conversation session with all enhanced features
export interface EnhancedConversationSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  messages: EnhancedConversationMessage[];
  summaries: SessionSummary[];
  speakers: Speaker[];
  isActive: boolean;
  compressedHistory: CompressedMessage[];
  title?: string;
  metadata?: {
    environment: 'tauri' | 'browser';
    version: string;
    [key: string]: any;
  };
}

// Storage format for localStorage persistence
export interface ConversationStorage {
  currentSessionId: string | null;
  sessions: Record<string, EnhancedConversationSession>;
  version: string;
  settings?: {
    autoCompressThreshold?: number;
    summaryIntervalMinutes?: number;
    maxHistoryLength?: number;
  };
}

// Speaker detection result
export interface SpeakerDetectionResult {
  speakerId: string;
  confidence: number;
  characteristics: string[];
  isNewSpeaker: boolean;
}

// File export options
export type ExportFormat = 'json' | 'txt' | 'md';

// Context compression configuration
export interface CompressionConfig {
  threshold: number; // Message count threshold
  ratio: number; // Compression ratio (0-1)
  minMessagesPerGroup: number;
  timeGroupingMinutes: number;
}

// Summary generation configuration
export interface SummaryConfig {
  intervalMinutes: number;
  maxKeyPoints: number;
  includeTimestamps: boolean;
  includeSpeakerStats: boolean;
  maxMessageLengthInSummary: number;
}

// Complete system configuration
export interface ConversationSystemConfig {
  storage: {
    autoSaveInterval?: number;
    maxStorageSizeMB?: number;
  };
  compression: CompressionConfig;
  summarization: SummaryConfig;
  speakerDetection: {
    similarityThreshold: number;
    minCharacteristicsForMatch: number;
  };
}

// Default configuration values
export const DEFAULT_CONFIG: ConversationSystemConfig = {
  storage: {
    autoSaveInterval: 5000, // 5 seconds
    maxStorageSizeMB: 4.5 // Leave room for other localStorage data
  },
  compression: {
    threshold: 50,
    ratio: 0.3,
    minMessagesPerGroup: 3,
    timeGroupingMinutes: 2
  },
  summarization: {
    intervalMinutes: 1,
    maxKeyPoints: 5,
    includeTimestamps: true,
    includeSpeakerStats: true,
    maxMessageLengthInSummary: 80
  },
  speakerDetection: {
    similarityThreshold: 0.3,
    minCharacteristicsForMatch: 2
  }
};
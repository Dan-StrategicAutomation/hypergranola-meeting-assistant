/**
 * File Export Service for Enhanced Conversation System
 *
 * Handles exporting conversation sessions to various file formats
 * with automatic download functionality.
 */

import { EnhancedConversationSession } from '../models/conversation';

export class FileExportService {
  private static instance: FileExportService;

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): FileExportService {
    if (!this.instance) {
      this.instance = new FileExportService();
    }
    return this.instance;
  }

  /**
   * Export a conversation session to the specified format
   */
  public exportSession(
    session: EnhancedConversationSession,
    format: 'json' | 'txt' | 'md' = 'json'
  ): void {
    let content = '';
    let filename = this.generateFilename(session);
    let mimeType = '';

    try {
      switch (format) {
        case 'json':
          content = this.exportToJSON(session);
          filename += '.json';
          mimeType = 'application/json';
          break;

        case 'txt':
          content = this.exportToText(session);
          filename += '.txt';
          mimeType = 'text/plain';
          break;

        case 'md':
          content = this.exportToMarkdown(session);
          filename += '.md';
          mimeType = 'text/markdown';
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      this.handleFileDownload(content, filename, mimeType);
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }

  /**
   * Generate a filename based on session metadata
   */
  private generateFilename(session: EnhancedConversationSession): string {
    const datePart = session.startTime.toISOString().split('T')[0];
    const timePart = session.startTime.toTimeString().split(':').slice(0, 2).join('-');
    const titlePart = session.title
      ? session.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)
      : 'conversation';

    return `conv_${datePart}_${timePart}_${titlePart}_${session.sessionId}`;
  }

  /**
   * Handle the actual file download process
   */
  private handleFileDownload(
    content: string,
    filename: string,
    mimeType: string
  ): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Export session to JSON format
   */
  private exportToJSON(session: EnhancedConversationSession): string {
    // Create a serialized version with ISO strings for dates
    const serializableSession = {
      ...session,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime?.toISOString(),
      messages: session.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString()
      })),
      summaries: session.summaries.map(sum => ({
        ...sum,
        timestamp: sum.timestamp.toISOString(),
        timeRange: {
          start: sum.timeRange.start.toISOString(),
          end: sum.timeRange.end.toISOString()
        }
      })),
      compressedHistory: session.compressedHistory.map(comp => ({
        ...comp,
        timeRange: {
          start: comp.timeRange.start.toISOString(),
          end: comp.timeRange.end.toISOString()
        }
      }))
    };

    return JSON.stringify(serializableSession, null, 2);
  }

  /**
   * Export session to plain text format
   */
  private exportToText(session: EnhancedConversationSession): string {
    let text = `Conversation Session Export\n`;
    text += `========================\n\n`;
    text += `Session ID: ${session.sessionId}\n`;
    text += `Title: ${session.title}\n`;
    text += `Started: ${session.startTime.toLocaleString()}\n`;
    text += `Ended: ${session.endTime ? session.endTime.toLocaleString() : 'Ongoing'}\n`;
    text += `Duration: ${this.calculateDuration(session)} minutes\n`;
    text += `Messages: ${session.messages.length}\n`;
    text += `Speakers: ${session.speakers.length}\n\n`;

    // Add speaker information
    text += `Speakers:\n`;
    session.speakers.forEach(speaker => {
      text += `- ${speaker.name}: ${speaker.messageCount} messages, first detected at ${speaker.firstDetected.toLocaleTimeString()}\n`;
    });
    text += `\n`;

    // Add conversation transcript
    text += `Conversation Transcript:\n`;
    text += `======================\n\n`;

    session.messages.forEach((msg, index) => {
      const speaker = session.speakers.find(s => s.speakerId === msg.speakerId) || { name: 'Unknown' };
      text += `[${msg.timestamp.toLocaleTimeString()}] ${speaker.name}: ${msg.content}\n`;
      if (msg.isQuestion) {
        text += `  (Question: ${msg.content})\n`;
      }
      text += `\n`;
    });

    // Add summaries if available
    if (session.summaries.length > 0) {
      text += `Automatic Summaries:\n`;
      text += `==================\n\n`;

      session.summaries.forEach((summary, index) => {
        text += `Summary ${index + 1} (${summary.timeRange.start.toLocaleTimeString()} - ${summary.timeRange.end.toLocaleTimeString()}):\n`;
        text += `${summary.content}\n\n`;
        text += `---\n\n`;
      });
    }

    return text;
  }

  /**
   * Export session to Markdown format
   */
  private exportToMarkdown(session: EnhancedConversationSession): string {
    let md = `# Conversation Session: ${session.title}\n\n`;
    md += `**Session ID:** ${session.sessionId}  \n`;
    md += `**Started:** ${session.startTime.toLocaleString()}  \n`;
    md += `**Duration:** ${this.calculateDuration(session)} minutes  \n`;
    md += `**Messages:** ${session.messages.length}  \n`;
    md += `**Speakers:** ${session.speakers.length}\n\n`;

    // Speakers section
    md += '## 🎤 Speakers\n\n';
    session.speakers.forEach(speaker => {
      md += `- **${speaker.name}**: ${speaker.messageCount} messages, first detected at ${speaker.firstDetected.toLocaleTimeString()}\n`;
      if (speaker.displayName) {
        md += `  (${speaker.displayName})\n`;
      }
    });
    md += '\n';

    // Conversation transcript
    md += '## 💬 Conversation Transcript\n\n';
    session.messages.forEach((msg, index) => {
      const speaker = session.speakers.find(s => s.speakerId === msg.speakerId) || { name: 'Unknown' };
      const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      md += `### ${time} - ${speaker.name}\n\n`;
      md += `${msg.content}\n\n`;
      if (msg.isQuestion) {
        md += `> **Question:** ${msg.content}\n\n`;
      }
      if (msg.keywords && msg.keywords.length > 0) {
        md += `**Keywords:** ${msg.keywords.join(', ')}\n\n`;
      }
    });

    // Summaries section
    if (session.summaries.length > 0) {
      md += '## 📊 Automatic Summaries\n\n';
      session.summaries.forEach((summary, index) => {
        const startTime = summary.timeRange.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = summary.timeRange.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        md += `### Summary ${index + 1}: ${startTime} - ${endTime}\n\n`;
        md += '```\n';
        md += summary.content;
        md += '\n```\n\n';

        if (summary.keyPoints.length > 0) {
          md += '**Key Points:**\n';
          summary.keyPoints.forEach(point => {
            md += `- ${point}\n`;
          });
          md += '\n';
        }

        if (summary.speakerStats.length > 0) {
          md += '**Speaker Activity:**\n';
          summary.speakerStats.forEach(stat => {
            const speaker = session.speakers.find(s => s.speakerId === stat.speakerId) || { name: 'Unknown' };
            md += `- **${speaker.name}**: ${stat.messageCount} messages, ${stat.questionsAsked} questions, ${stat.wordCount} words\n`;
          });
          md += '\n';
        }

        md += '---\n\n';
      });
    }

    // Compressed history if available
    if (session.compressedHistory.length > 0) {
      md += '## 🗄️ Compressed History\n\n';
      md += '*(Context-optimized summary of longer exchanges)*\n\n';
      session.compressedHistory.forEach((comp, index) => {
        const startTime = comp.timeRange.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = comp.timeRange.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const speaker = session.speakers.find(s => s.speakerId === comp.speakerId) || { name: 'Unknown' };
        md += `### ${startTime} - ${endTime} (${speaker.name}, ${comp.originalMessageIds.length} messages → ${comp.compressionRatio.toFixed(2)}x)\n\n`;
        md += `${comp.summary}\n\n`;
      });
    }

    return md;
  }

  /**
   * Calculate session duration in minutes
   */
  private calculateDuration(session: EnhancedConversationSession): number {
    const endTime = session.endTime || new Date();
    const durationMs = endTime.getTime() - session.startTime.getTime();
    return Math.round(durationMs / (60 * 1000));
  }

  /**
   * Export all sessions to a single file
   */
  public exportAllSessions(format: 'json' | 'txt' | 'md' = 'json'): void {
    const allSessions = Object.values(
      EnhancedConversationStorageManager.getInstance().getAllSessions()
    );

    if (allSessions.length === 0) {
      throw new Error('No sessions available to export');
    }

    let content = '';
    let filename = `all_conversations_${new Date().toISOString().split('T')[0]}`;
    let mimeType = '';

    switch (format) {
      case 'json':
        content = JSON.stringify(allSessions.map(s => ({
          sessionId: s.sessionId,
          title: s.title,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime?.toISOString(),
          messageCount: s.messages.length,
          speakerCount: s.speakers.length,
          summaryCount: s.summaries.length
        })), null, 2);
        filename += '.json';
        mimeType = 'application/json';
        break;

      case 'txt':
        content = allSessions.map((s, index) =>
          `Session ${index + 1}: ${s.title}\n` +
          `Started: ${s.startTime.toLocaleString()}\n` +
          `Messages: ${s.messages.length}\n` +
          `Speakers: ${s.speakers.length}\n` +
          `Duration: ${this.calculateDuration(s)} minutes\n\n`
        ).join('\n');
        filename += '.txt';
        mimeType = 'text/plain';
        break;

      case 'md':
        content = '# All Conversation Sessions\n\n' +
          allSessions.map((s, index) =>
            `## Session ${index + 1}: ${s.title}\n\n` +
            `- **ID:** ${s.sessionId}\n` +
            `- **Started:** ${s.startTime.toLocaleString()}\n` +
            `- **Duration:** ${this.calculateDuration(s)} minutes\n` +
            `- **Messages:** ${s.messages.length}\n` +
            `- **Speakers:** ${s.speakers.length}\n` +
            `- **Summaries:** ${s.summaries.length}\n\n`
          ).join('');
        filename += '.md';
        mimeType = 'text/markdown';
        break;
    }

    this.handleFileDownload(content, filename, mimeType);
  }

  /**
   * Create a zip file containing all sessions in their native format
   * (This would require a zip library in a real implementation)
   */
  public async exportAllSessionsAsZip(): Promise<void> {
    // In a real implementation, this would use JSZip or similar
    console.warn('Zip export not implemented - would require JSZip library');
    throw new Error('Zip export functionality requires additional libraries');
  }
}

// Singleton instance for easy access
export const fileExportService = FileExportService.getInstance();
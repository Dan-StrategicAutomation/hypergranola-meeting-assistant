import { EnhancedConversationSession } from '../models/conversation';

/**
 * Lightweight local summarizer for meeting summaries.
 * This is an extractive, heuristic-based summarizer intended as a
 * quick, offline-friendly fallback while more advanced model-backed
 * summarization is implemented later.
 */

function splitIntoSentences(text: string): string[] {
  // Very small, robust sentence splitter
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function pushUnique(target: string[], candidate: string) {
  const normalized = candidate.trim();
  if (!normalized) return;
  if (!target.some(t => t.toLowerCase() === normalized.toLowerCase())) {
    target.push(normalized);
  }
}

export function generateMeetingBullets(
  session: EnhancedConversationSession,
  maxBullets: number = 6
): string[] {
  const bullets: string[] = [];

  if (!session || !session.messages || session.messages.length === 0) {
    return ['No conversation content available to summarize.'];
  }

  // 1) Prefer explicit summaries if available (timed summaries)
  if (session.summaries && session.summaries.length > 0) {
    // Take most recent summary's keyPoints first
    const recent = session.summaries[session.summaries.length - 1];
    recent.keyPoints?.forEach(k => pushUnique(bullets, k));
  }

  // 2) Scan messages for decisions, action items, and questions
  const decisionRegex = /\b(?:agreed|decided|approve|approved|accept|accepted|we will|we'll|let's|let us|decision)\b/i;
  const actionRegex = /\b(?:please|assign|action|task|can you|could you|will you|i will|i'll|we will|due by|by Friday|by Monday|deadline)\b/i;
  const questionRegex = /\?/;

  for (let i = session.messages.length - 1; i >= 0 && bullets.length < maxBullets; i--) {
    const msg = session.messages[i];
    // Break message into sentences for finer-grained bullets
    const sents = splitIntoSentences(msg.content || '');

    for (const sent of sents) {
      if (bullets.length >= maxBullets) break;

      if (decisionRegex.test(sent)) {
        pushUnique(bullets, `Decision: ${sent}`);
        continue;
      }

      if (actionRegex.test(sent)) {
        pushUnique(bullets, `Action: ${sent}`);
        continue;
      }

      if (questionRegex.test(sent)) {
        pushUnique(bullets, `Open question: ${sent}`);
        continue;
      }
    }
  }

  // 3) If we still need bullets, include high-word-count messages as takeaways
  if (bullets.length < maxBullets) {
    const longMessages = [...session.messages]
      .sort((a, b) => b.wordCount - a.wordCount)
      .slice(0, maxBullets * 2);

    for (const msg of longMessages) {
      if (bullets.length >= maxBullets) break;
      const snippet = msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content;
      pushUnique(bullets, `${snippet}`);
    }
  }

  // 4) Post-process: ensure brevity and limit to maxBullets
  return bullets.slice(0, maxBullets).map(b => b.replace(/\s+/g, ' ').trim());
}

export function generateMeetingSummaryText(
  session: EnhancedConversationSession,
  maxBullets: number = 6
): string {
  const bullets = generateMeetingBullets(session, maxBullets);
  const lines = ['Meeting Summary', '---------------', ''];
  bullets.forEach(b => lines.push(`- ${b}`));
  lines.push('');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  return lines.join('\n');
}

export default {
  generateMeetingBullets,
  generateMeetingSummaryText
};

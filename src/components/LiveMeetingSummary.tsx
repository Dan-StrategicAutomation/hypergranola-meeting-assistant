import React, { useEffect, useState } from 'react';
import { conversationStorage } from '../services/conversationStorage';
import { generateMeetingBullets } from '../services/summarizerService';
import { hasBrowserAPIKey, browserAskCoach } from '../utils/environment';
import { instantAnswer, openDuckDuckGo } from '../services/researchService';

const LiveMeetingSummary: React.FC = () => {
  const [bullets, setBullets] = useState<string[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    const update = () => {
      const session = conversationStorage.getCurrentSession();
      if (!session) {
        setBullets([]);
        return;
      }
      setBullets(generateMeetingBullets(session, 6));
    };

    // Initial update
    update();

    const id = window.setInterval(update, 3000);
    return () => window.clearInterval(id);
  }, []);

  const handleAiSummarize = async () => {
    const session = conversationStorage.getCurrentSession();
    if (!session) return;
    if (!hasBrowserAPIKey()) {
      window.alert('AI summary requires a configured browser API key. Open Settings to configure.');
      return;
    }

    setLoadingAi(true);
    try {
      // Build short context from recent messages and the heuristic bullets
      const recentMsgs = session.messages.slice(-40);
      const recentText = recentMsgs.map(m => `${m.speakerId}: ${m.content}`).join('\n');
      const heuristics = generateMeetingBullets(session, 6).join('\n');

      // Prompt includes meeting title and heuristics to steer the model to structured output.
      const prompt = `You are a concise meeting assistant. Use the meeting title and the recent conversation excerpts and heuristic bullets to produce up to 5 concise bullet points: decisions, action items (include owner if obvious), and open questions. Output bullets only, one per line. If you believe an external web search is required to confirm a named tool/library or a factual claim, append a final line starting with "SEARCH_QUERY:" followed by a short search query. Meeting title: ${session.title || 'Untitled'}\n\nHeuristic bullets:\n${heuristics}\n\nRecent conversation excerpts:\n${recentText}\n\nRespond now:`;

      const res = await browserAskCoach(prompt, '');
      setAiSummary(res);

      // If the model requested a search, detect it and perform instantAnswer
      const lines = (res || '').split('\n').map(l => l.trim()).filter(Boolean);
      const searchLine = lines.find(l => l.toUpperCase().startsWith('SEARCH_QUERY:'));
      if (searchLine) {
        const q = searchLine.split(':').slice(1).join(':').trim();
        if (q) {
          const ia = await instantAnswer(q);
          if (ia) {
            // Append a brief citation to the AI summary
            const citation = `\n\nQuick web result for "${q}": ${ia.heading || ''}${ia.abstract ? ' — ' + ia.abstract : ''}${ia.url ? ' \n' + ia.url : ''}`;
            setAiSummary(prev => (prev || '') + citation);
          }
        }
      }
    } catch (err) {
      console.error('AI summarization failed', err);
      window.alert('AI summarization failed — see console for details.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleOpenSearch = async () => {
    const session = conversationStorage.getCurrentSession();
    if (!session) return;
    // Build a sensible search query from title + heuristics
    const heuristics = generateMeetingBullets(session, 6).slice(0,3).join(' ');
    const q = `${session.title || ''} ${heuristics}`.trim();
    if (!q) {
      window.alert('Not enough context to search.');
      return;
    }
    openDuckDuckGo(q);
  };

  return (
    <div className="live-summary-panel">
      <h4>Live Summary</h4>
      {bullets.length === 0 ? (
        <p className="muted">No conversation content yet.</p>
      ) : (
        <ul>
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}

      <div style={{ marginTop: '0.5rem' }}>
        <button className="ai-summary-btn" onClick={handleAiSummarize} disabled={loadingAi}>
          {loadingAi ? 'Summarizing…' : 'Refresh AI Summary'}
        </button>
        <button style={{ marginLeft: '0.5rem' }} className="search-btn" onClick={handleOpenSearch}>
          Search (DuckDuckGo)
        </button>
      </div>

      {aiSummary && (
        <div className="ai-summary-result">
          <h5>AI Summary</h5>
          <pre>{aiSummary}</pre>
        </div>
      )}
    </div>
  );
};

export default LiveMeetingSummary;

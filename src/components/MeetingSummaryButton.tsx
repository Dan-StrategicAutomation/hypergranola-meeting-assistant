import React, { useState } from 'react';
import { conversationStorage } from '../services/conversationStorage';
import { fileExportService } from '../services/fileExportService';

const MeetingSummaryButton: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    const session = conversationStorage.getCurrentSession();
    if (!session) {
      window.alert('No active meeting session to summarize.');
      return;
    }

    setLoading(true);
    try {
      // Default to markdown summary with 6 bullets
      fileExportService.exportMeetingSummary(session, 'md', 6);
      // Lightweight feedback to the user
      // Note: the download will be handled by the browser
      setTimeout(() => window.alert('Meeting summary exported (check your downloads).'), 200);
    } catch (err) {
      console.error('Failed to export meeting summary:', err);
      window.alert('Failed to export meeting summary. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={`summary-btn ${loading ? 'loading' : ''}`}
      onClick={handleExport}
      aria-label="Export meeting summary"
    >
      {loading ? 'Exporting…' : 'Export Summary'}
    </button>
  );
};

export default MeetingSummaryButton;

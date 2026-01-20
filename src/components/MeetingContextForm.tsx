import React, { useState, useEffect, lazy } from 'react';

// Lazy-loaded UI parts to keep initial bundle small
const LiveMeetingSummary = lazy(() => import('./LiveMeetingSummary'));
const MeetingSummaryButton = lazy(() => import('./MeetingSummaryButton'));
import { isTauri } from '../utils/environment';

interface MeetingParticipant {
  name: string;
  role: string;
  email?: string;
}

interface MeetingGoal {
  description: string;
  priority: number;
}

interface MeetingContext {
  title: string;
  description?: string;
  domain: 'Technical' | 'Sales' | 'Medical' | 'Legal' | 'Educational' | 'General' | 'Custom';
  participants: MeetingParticipant[];
  goals: MeetingGoal[];
  duration_estimate_minutes: number;
}

interface MeetingContextFormProps {
  onClose: () => void;
  onSave: (context: MeetingContext) => void;
}

const MeetingContextForm: React.FC<MeetingContextFormProps> = ({ onClose, onSave }) => {
  const [context, setContext] = useState<MeetingContext>({
    title: '',
    description: '',
    domain: 'General',
    participants: [],
    goals: [],
    duration_estimate_minutes: 60,
  });

  const [newParticipant, setNewParticipant] = useState({ name: '', role: '', email: '' });
  const [newGoal, setNewGoal] = useState({ description: '', priority: 3 });

  // Load existing context on mount
  useEffect(() => {
    const loadExistingContext = async () => {
      try {
        if (isTauri()) {
          // Only use Tauri invoke in Tauri environment
          const { invoke } = await import('@tauri-apps/api/core');
          const existingContext = await invoke<MeetingContext | null>('get_current_meeting_context');
          if (existingContext) {
            setContext(existingContext);
          }
        } else {
          // In browser mode, load from localStorage
          const stored = localStorage.getItem('meetingContext');
          if (stored) {
            setContext(JSON.parse(stored));
          }
        }
      } catch (error) {
        console.warn('Failed to load existing context:', error);
      }
    };
    loadExistingContext();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isTauri()) {
        // Save via Tauri backend in Tauri environment
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_meeting_context', { context });
      } else {
        // Save to localStorage in browser mode
        localStorage.setItem('meetingContext', JSON.stringify(context));
      }
      onSave(context);
    } catch (error) {
      console.error('Failed to save meeting context:', error);
    }
  };

  const addParticipant = () => {
    if (newParticipant.name.trim() && newParticipant.role.trim()) {
      setContext(prev => ({
        ...prev,
        participants: [...prev.participants, { ...newParticipant }]
      }));
      setNewParticipant({ name: '', role: '', email: '' });
    }
  };

  const removeParticipant = (index: number) => {
    setContext(prev => ({
      ...prev,
      participants: prev.participants.filter((_, i) => i !== index)
    }));
  };

  const addGoal = () => {
    if (newGoal.description.trim()) {
      setContext(prev => ({
        ...prev,
        goals: [...prev.goals, { ...newGoal }]
      }));
      setNewGoal({ description: '', priority: 3 });
    }
  };

  const removeGoal = (index: number) => {
    setContext(prev => ({
      ...prev,
      goals: prev.goals.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="meeting-context-form-overlay">
      <div className="meeting-context-form">
        {/* Live summary panel shows a short, updating summary while editing meeting context */}
        <div style={{ margin: '0 1rem 1rem 1rem' }}>
          <React.Suspense fallback={<div>Loading summary…</div>}>
            <LiveMeetingSummary />
          </React.Suspense>
        </div>
        <div className="form-header">
          <h2>Meeting Context Setup</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>Basic Information</h3>
            <div className="form-group">
              <label htmlFor="title">Meeting Title *</label>
              <input
                id="title"
                type="text"
                value={context.title}
                onChange={(e) => setContext(prev => ({ ...prev, title: e.target.value }))}
                required
                placeholder="Enter meeting title"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={context.description}
                onChange={(e) => setContext(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the meeting"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="domain">Meeting Domain *</label>
              <select
                id="domain"
                value={context.domain}
                onChange={(e) => setContext(prev => ({ ...prev, domain: e.target.value as any }))}
              >
                <option value="General">General</option>
                <option value="Technical">Technical</option>
                <option value="Sales">Sales</option>
                <option value="Medical">Medical</option>
                <option value="Legal">Legal</option>
                <option value="Educational">Educational</option>
                <option value="Custom">Custom</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="duration">Estimated Duration (minutes)</label>
              <input
                id="duration"
                type="number"
                value={context.duration_estimate_minutes}
                onChange={(e) => setContext(prev => ({ ...prev, duration_estimate_minutes: parseInt(e.target.value) || 60 }))}
                min="15"
                max="480"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Participants</h3>
            <div className="participant-input">
              <input
                type="text"
                placeholder="Name"
                value={newParticipant.name}
                onChange={(e) => setNewParticipant(prev => ({ ...prev, name: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Role"
                value={newParticipant.role}
                onChange={(e) => setNewParticipant(prev => ({ ...prev, role: e.target.value }))}
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={newParticipant.email}
                onChange={(e) => setNewParticipant(prev => ({ ...prev, email: e.target.value }))}
              />
              <button type="button" onClick={addParticipant} className="add-btn">Add</button>
            </div>

            <div className="participant-list">
              {context.participants.map((participant, index) => (
                <div key={index} className="participant-item">
                  <span>{participant.name} ({participant.role})</span>
                  {participant.email && <span className="email">{participant.email}</span>}
                  <button type="button" onClick={() => removeParticipant(index)} className="remove-btn">×</button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h3>Meeting Goals</h3>
            <div className="goal-input">
              <input
                type="text"
                placeholder="Goal description"
                value={newGoal.description}
                onChange={(e) => setNewGoal(prev => ({ ...prev, description: e.target.value }))}
              />
              <select
                value={newGoal.priority}
                onChange={(e) => setNewGoal(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
              >
                <option value={1}>Low</option>
                <option value={2}>Medium</option>
                <option value={3}>High</option>
                <option value={4}>Critical</option>
              </select>
              <button type="button" onClick={addGoal} className="add-btn">Add</button>
            </div>

            <div className="goal-list">
              {context.goals.map((goal, index) => (
                <div key={index} className="goal-item">
                  <span className={`priority priority-${goal.priority}`}>
                    {goal.priority === 4 ? '🔴' : goal.priority === 3 ? '🟠' : goal.priority === 2 ? '🟡' : '🟢'}
                  </span>
                  <span>{goal.description}</span>
                  <button type="button" onClick={() => removeGoal(index)} className="remove-btn">×</button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-btn">Cancel</button>
            {/* Export summary button added here for quick access */}
            <div style={{ display: 'inline-block', marginRight: '0.5rem' }}>
              <React.Suspense fallback={<button className="summary-btn">Export Summary</button>}>
                <MeetingSummaryButton />
              </React.Suspense>
            </div>
            <button type="submit" className="save-btn">Save Meeting Context</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MeetingContextForm;
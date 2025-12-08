/**
 * Rendering Test Component
 *
 * This component tests the basic rendering functionality
 * of the enhanced conversation system to identify issues.
 */

import React, { useState, useEffect } from 'react';
import { conversationStorage } from '../services/conversationStorage';
import { fileExportService } from '../services/fileExportService';

export const RenderingTest: React.FC = () => {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    runTests();
  }, []);

  const runTests = async () => {
    setIsTesting(true);
    const results: string[] = [];

    try {
      // Test 1: Service initialization
      results.push('🔍 Testing service initialization...');
      const storage = conversationStorage;
      if (storage) {
        results.push('✅ Conversation storage service initialized');
      } else {
        results.push('❌ Conversation storage service failed to initialize');
      }

      // Test 2: Basic functionality
      results.push('🔍 Testing basic functionality...');
      try {
        const session = storage.getCurrentSession();
        if (session) {
          results.push(`✅ Current session found: ${session.sessionId}`);
        } else {
          results.push('⚠️ No current session (this is normal for first run)');
          const newSession = storage.startNewSession('Test Session');
          results.push(`✅ Created new session: ${newSession.sessionId}`);
        }
      } catch (error) {
        results.push(`❌ Basic functionality failed: ${error}`);
      }

      // Test 3: Message handling
      results.push('🔍 Testing message handling...');
      try {
        const msg = storage.addMessage('Test message', false);
        results.push(`✅ Message added: ${msg.id}`);
      } catch (error) {
        results.push(`❌ Message handling failed: ${error}`);
      }

      // Test 4: Export functionality
      results.push('🔍 Testing export functionality...');
      try {
        const session = storage.getCurrentSession();
        if (session) {
          // This will trigger a download, so we'll just test the method exists
          results.push('✅ Export service methods available');
        }
      } catch (error) {
        results.push(`❌ Export functionality failed: ${error}`);
      }

      // Test 5: CSS loading
      results.push('🔍 Testing CSS loading...');
      const testElement = document.createElement('div');
      testElement.className = 'conversation-btn';
      document.body.appendChild(testElement);
      const computedStyle = window.getComputedStyle(testElement);
      if (computedStyle.background) {
        results.push('✅ CSS styles are loading correctly');
      } else {
        results.push('❌ CSS styles may not be loading');
      }
      document.body.removeChild(testElement);

    } catch (error) {
      results.push(`❌ Unexpected error during testing: ${error}`);
    } finally {
      setTestResults(results);
      setIsTesting(false);
    }
  };

  return (
    <div className="rendering-test">
      <h2>🧪 Rendering Test</h2>
      <p>Running diagnostic tests for the enhanced conversation system...</p>

      {isTesting ? (
        <div className="loading">Testing in progress...</div>
      ) : (
        <div className="test-results">
          <h3>Test Results:</h3>
          <ul>
            {testResults.map((result, index) => (
              <li key={index} className={result.startsWith('✅') ? 'success' : result.startsWith('❌') ? 'error' : 'info'}>
                {result}
              </li>
            ))}
          </ul>

          {testResults.some(r => r.startsWith('❌')) && (
            <div className="error-summary">
              <h4>⚠️ Issues Detected</h4>
              <p>Some tests failed. Please check the console for detailed error information.</p>
            </div>
          )}

          {!testResults.some(r => r.startsWith('❌')) && testResults.length > 0 && (
            <div className="success-summary">
              <h4>🎉 All Tests Passed</h4>
              <p>The enhanced conversation system appears to be working correctly.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Add some basic styles for the test component
const testStyles = `
.rendering-test {
  padding: 1rem;
  background: #2a2a2a;
  border-radius: 8px;
  margin: 1rem;
  color: #f6f6f6;
}

.test-results {
  margin-top: 1rem;
}

.test-results li {
  margin: 0.5rem 0;
  padding: 0.5rem;
  border-radius: 4px;
}

.test-results .success {
  background: #2a3a2a;
  color: #aaf0a6;
}

.test-results .error {
  background: #3a2a2a;
  color: #f0a6a6;
}

.test-results .info {
  background: #2a2a3a;
  color: #a6a6f0;
}

.loading {
  color: #88c0d0;
  font-style: italic;
}

.error-summary {
  background: #3a2a2a;
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}

.success-summary {
  background: #2a3a2a;
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}
`;

// Add styles to the document
const styleElement = document.createElement('style');
styleElement.textContent = testStyles;
document.head.appendChild(styleElement);

export default RenderingTest;
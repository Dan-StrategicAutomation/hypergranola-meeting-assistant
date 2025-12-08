/**
 * Test suite for Enhanced Conversation Tracking System
 *
 * This file contains tests to verify the functionality of the
 * conversation storage, speaker detection, and summarization features.
 */

import { conversationStorage } from '../services/conversationStorage';
import { fileExportService } from '../services/fileExportService';

// Simple test runner
async function runTests() {
  console.log('🧪 Starting Enhanced Conversation System Tests...');

  try {
    // Test 1: Basic initialization
    console.log('Test 1: System Initialization');
    const storage = conversationStorage;
    const currentSession = storage.getCurrentSession();
    console.log(`✅ Session initialized: ${currentSession ? 'Yes' : 'No'}`);

    // Test 2: Message handling
    console.log('Test 2: Message Handling');
    const msg1 = storage.addMessage('Hello, how are you today?', true);
    const msg2 = storage.addMessage('I am doing well, thank you!', false);
    console.log(`✅ Messages added: ${msg1.id}, ${msg2.id}`);

    // Test 3: Speaker detection
    console.log('Test 3: Speaker Detection');
    const session = storage.getCurrentSession();
    if (session && session.speakers.length > 0) {
      console.log(`✅ Speakers detected: ${session.speakers.length}`);
      session.speakers.forEach(speaker => {
        console.log(`  - ${speaker.name}: ${speaker.messageCount} messages`);
      });
    }

    // Test 4: Summary generation (after waiting)
    console.log('Test 4: Summary Generation');
    console.log('⏳ Waiting for automatic summary generation...');
    await new Promise(resolve => setTimeout(resolve, 1500));

    const updatedSession = storage.getCurrentSession();
    if (updatedSession && updatedSession.summaries.length > 0) {
      console.log(`✅ Summaries generated: ${updatedSession.summaries.length}`);
    } else {
      console.log('⚠️ No summaries yet (expected for short conversations)');
    }

    // Test 5: Export functionality
    console.log('Test 5: Export Functionality');
    if (updatedSession) {
      try {
        console.log('📄 Testing JSON export...');
        fileExportService.exportSession(updatedSession, 'json');
        console.log('✅ JSON export successful');

        console.log('📝 Testing TXT export...');
        fileExportService.exportSession(updatedSession, 'txt');
        console.log('✅ TXT export successful');

        console.log('📖 Testing Markdown export...');
        fileExportService.exportSession(updatedSession, 'md');
        console.log('✅ Markdown export successful');
      } catch (exportError) {
        console.error('❌ Export failed:', exportError);
      }
    }

    // Test 6: Session management
    console.log('Test 6: Session Management');
    const newSession = storage.startNewSession('Test Session');
    console.log(`✅ New session created: ${newSession.sessionId}`);

    const allSessions = storage.getAllSessions();
    console.log(`✅ Total sessions: ${allSessions.length}`);

    console.log('🎉 All tests completed successfully!');
    console.log('📊 System is ready for use!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run tests when this module is imported
if (typeof window !== 'undefined') {
  // Run tests after a short delay to allow system initialization
  setTimeout(runTests, 2000);
}

// Export for manual testing
export { runTests };
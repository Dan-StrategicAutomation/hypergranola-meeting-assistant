//! Meeting context management for the AI Meeting Assistant
//! Handles meeting setup, participant management, and context-aware AI interactions

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Meeting domain types for specialized AI prompts and behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MeetingDomain {
    Technical,
    Sales,
    Medical,
    Legal,
    Educational,
    General,
    Custom(String),
}

impl Default for MeetingDomain {
    fn default() -> Self {
        MeetingDomain::General
    }
}

/// Meeting participant information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingParticipant {
    pub name: String,
    pub role: String,
    pub email: Option<String>,
    pub is_present: bool,
}

/// Meeting goals and objectives
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingGoal {
    pub description: String,
    pub priority: u8, // 1-5, higher is more important
    pub status: GoalStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GoalStatus {
    Pending,
    InProgress,
    Completed,
    Cancelled,
}

/// Pre-generated questions for the meeting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreGeneratedQuestion {
    pub question: String,
    pub category: String, // e.g., "clarification", "follow-up", "technical"
    pub priority: u8,
    pub asked: bool,
}

/// Background information and research
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundInfo {
    pub topic: String,
    pub content: String,
    pub source: String,
    pub relevance_score: f32, // 0.0 to 1.0
}

/// Complete meeting context structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingContext {
    // Basic meeting information
    pub title: String,
    pub description: Option<String>,
    pub domain: MeetingDomain,

    // Participants
    pub participants: Vec<MeetingParticipant>,

    // Meeting structure
    pub goals: Vec<MeetingGoal>,
    pub duration_estimate_minutes: u32,
    pub pre_generated_questions: Vec<PreGeneratedQuestion>,

    // Background and preparation
    pub background_info: HashMap<String, BackgroundInfo>,
    pub key_points_to_cover: Vec<String>,
    pub potential_challenges: Vec<String>,

    // Meeting metadata
    pub template_name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_modified: chrono::DateTime<chrono::Utc>,
}

impl Default for MeetingContext {
    fn default() -> Self {
        Self {
            title: "New Meeting".to_string(),
            description: None,
            domain: MeetingDomain::General,
            participants: Vec::new(),
            goals: Vec::new(),
            duration_estimate_minutes: 60,
            pre_generated_questions: Vec::new(),
            background_info: HashMap::new(),
            key_points_to_cover: Vec::new(),
            potential_challenges: Vec::new(),
            template_name: None,
            created_at: chrono::Utc::now(),
            last_modified: chrono::Utc::now(),
        }
    }
}

impl MeetingContext {
    /// Create a new meeting context with basic information
    #[allow(dead_code)]
    pub fn new(title: String, domain: MeetingDomain) -> Self {
        Self {
            title,
            domain,
            ..Default::default()
        }
    }

    /// Add a participant to the meeting
    pub fn add_participant(&mut self, name: String, role: String, email: Option<String>) {
        self.participants.push(MeetingParticipant {
            name,
            role,
            email,
            is_present: false,
        });
        self.last_modified = chrono::Utc::now();
    }

    /// Add a meeting goal
    pub fn add_goal(&mut self, description: String, priority: u8) {
        self.goals.push(MeetingGoal {
            description,
            priority,
            status: GoalStatus::Pending,
        });
        self.last_modified = chrono::Utc::now();
    }

    /// Add background information
    #[allow(dead_code)]
    pub fn add_background_info(&mut self, topic: String, content: String, source: String, relevance: f32) {
        self.background_info.insert(topic.clone(), BackgroundInfo {
            topic,
            content,
            source,
            relevance_score: relevance,
        });
        self.last_modified = chrono::Utc::now();
    }

    /// Generate domain-specific AI prompt prefix
    pub fn get_ai_prompt_prefix(&self) -> String {
        match &self.domain {
            MeetingDomain::Technical => {
                "You are an expert technical meeting facilitator specializing in software development, engineering, and technical discussions. Provide insights, ask clarifying questions, and help ensure technical accuracy and completeness.".to_string()
            },
            MeetingDomain::Sales => {
                "You are an expert sales meeting facilitator specializing in customer interactions, deal progression, and sales strategy. Provide insights on customer needs, objection handling, and deal advancement.".to_string()
            },
            MeetingDomain::Medical => {
                "You are an expert medical meeting facilitator specializing in healthcare discussions, patient care, and medical decision-making. Provide insights while maintaining HIPAA compliance and medical accuracy.".to_string()
            },
            MeetingDomain::Legal => {
                "You are an expert legal meeting facilitator specializing in legal discussions, contract negotiations, and compliance matters. Provide insights while emphasizing legal accuracy and risk considerations.".to_string()
            },
            MeetingDomain::Educational => {
                "You are an expert educational meeting facilitator specializing in learning objectives, curriculum development, and educational outcomes. Provide insights on teaching effectiveness and learning goals.".to_string()
            },
            MeetingDomain::General => {
                "You are an expert meeting facilitator specializing in productive meetings, clear communication, and effective decision-making. Provide insights to improve meeting outcomes and participant engagement.".to_string()
            },
            MeetingDomain::Custom(description) => {
                format!("You are an expert meeting facilitator specializing in {} discussions. Provide relevant insights and help ensure productive outcomes.", description)
            }
        }
    }

    /// Get context summary for AI prompts
    pub fn get_context_summary(&self) -> String {
        let mut summary = format!("Meeting: {}\n", self.title);

        if let Some(desc) = &self.description {
            summary.push_str(&format!("Description: {}\n", desc));
        }

        summary.push_str(&format!("Domain: {:?}\n", self.domain));
        summary.push_str(&format!("Duration: {} minutes\n", self.duration_estimate_minutes));

        if !self.participants.is_empty() {
            summary.push_str(&format!("Participants ({}): ", self.participants.len()));
            let participant_names: Vec<String> = self.participants.iter()
                .map(|p| format!("{} ({})", p.name, p.role))
                .collect();
            summary.push_str(&participant_names.join(", "));
            summary.push_str("\n");
        }

        if !self.goals.is_empty() {
            summary.push_str("Goals:\n");
            for goal in &self.goals {
                summary.push_str(&format!("  - {} (Priority: {})\n", goal.description, goal.priority));
            }
        }

        summary
    }
}

/// Meeting context manager for handling multiple meetings
pub struct MeetingContextManager {
    current_context: Option<MeetingContext>,
    context_history: Vec<MeetingContext>,
}

impl Default for MeetingContextManager {
    fn default() -> Self {
        Self {
            current_context: None,
            context_history: Vec::new(),
        }
    }
}

impl MeetingContextManager {
    /// Set the current meeting context
    pub fn set_context(&mut self, context: MeetingContext) {
        if let Some(old_context) = self.current_context.take() {
            self.context_history.push(old_context);
        }
        self.current_context = Some(context);
    }

    /// Get the current meeting context
    pub fn get_current_context(&self) -> Option<&MeetingContext> {
        self.current_context.as_ref()
    }

    /// Get mutable reference to current context
    pub fn get_current_context_mut(&mut self) -> Option<&mut MeetingContext> {
        self.current_context.as_mut()
    }

    /// Clear current context
    pub fn clear_context(&mut self) {
        if let Some(context) = self.current_context.take() {
            self.context_history.push(context);
        }
    }

    /// Get context history
    #[allow(dead_code)]
    pub fn get_context_history(&self) -> &[MeetingContext] {
        &self.context_history
    }
}
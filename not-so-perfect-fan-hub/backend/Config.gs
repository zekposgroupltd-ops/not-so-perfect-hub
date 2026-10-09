/**
 * Config.gs — static configuration only.
 * Secrets (spreadsheet ID, password pepper, folder IDs) live in Script Properties, never in code.
 * Business values (rewards, limits, levels) live in the Settings sheet; DEFAULT_SETTINGS seeds them
 * on first setup and acts as the fallback if a key is missing.
 */
const APP = {
  NAME: 'Not So Perfect: Beyond the Film — Fan Hub',
  VERSION: '0.1.0 (Part 1: Foundation)',
  TIMEZONE: 'Africa/Lagos',
  // PBKDF2 iterations are fixed in code (not in the admin-editable Settings sheet) so they cannot be
  // lowered by a settings change. Each stored hash carries its own count, so raising this later is safe.
  PBKDF2_ITERATIONS: 3000,
  RESERVED_USERNAMES: ['admin', 'administrator', 'moderator', 'mod', 'system', 'support', 'zekpo', 'zentrix', 'staff', 'root'],
  ROLES: ['fan', 'moderator', 'admin'],
  ACCOUNT_STATUSES: ['active', 'suspended', 'deleted']
};

const DEFAULT_SETTINGS = {
  registration_open: true,
  rules_version: '1',
  session_ttl_hours: 72,
  session_ttl_remember_hours: 720,
  login_max_failures: 5,
  login_lockout_minutes: 15,
  password_min_length: 10,
  // Points (community engagement points — never money)
  reward_daily_checkin: 5,
  reward_daily_question: 10,
  reward_activity: 10,
  reward_poll_vote: 2,
  reward_memory: 15,
  reward_story_chapter: 20,
  // Chat policy
  chat_free_messages_per_day: 5,
  chat_extra_message_cost: 1,
  chat_max_length: 500,
  chat_min_seconds_between_messages: 3,
  // Levels use lifetime earned points
  levels_json: [
    { level: 1, name: 'New Fan', min: 0 },
    { level: 2, name: 'Curious Viewer', min: 50 },
    { level: 3, name: 'Scene Enthusiast', min: 150 },
    { level: 4, name: 'Film Insider', min: 350 },
    { level: 5, name: 'Superfan', min: 700 },
    { level: 6, name: 'Community Legend', min: 1500 }
  ]
};

/**
 * Database schema. "name:n" = numeric column, "name:b" = boolean, otherwise text.
 * Setup creates these sheets/headers; Database.gs validates against them on every request.
 */
const SCHEMA = {
  Users: ['user_id', 'username', 'display_name', 'email', 'password_hash', 'account_status', 'role', 'profile_image', 'bio', 'total_points:n', 'lifetime_points:n', 'level:n', 'created_at', 'last_login', 'last_activity_at', 'last_message_date', 'daily_message_count:n', 'last_checkin_date', 'total_checkins:n', 'is_verified:b'],
  Sessions: ['session_id', 'user_id', 'token_hash', 'created_at', 'expires_at', 'revoked_at', 'last_used_at'],
  PointsLedger: ['transaction_id', 'user_id', 'transaction_type', 'points_change:n', 'balance_after:n', 'source', 'source_id', 'idempotency_key', 'created_at', 'created_by'],
  Activities: ['activity_id', 'title', 'description', 'activity_type', 'points_reward:n', 'start_at', 'end_at', 'daily_limit:n', 'status', 'verification_method', 'created_by', 'created_at'],
  ActivitySubmissions: ['submission_id', 'activity_id', 'user_id', 'response', 'status', 'awarded_points:n', 'reviewed_by', 'submitted_at', 'reviewed_at'],
  ChatMessages: ['message_id', 'user_id', 'message_text', 'attachment_id', 'created_at', 'edited_at', 'deleted_at', 'moderation_status'],
  Polls: ['poll_id', 'title', 'description', 'options_json', 'start_at', 'end_at', 'status', 'created_by', 'created_at'],
  PollVotes: ['vote_id', 'poll_id', 'user_id', 'option_id', 'created_at'],
  MemoryWall: ['memory_id', 'user_id', 'title', 'caption', 'media_id', 'visibility', 'moderation_status', 'created_at', 'approved_at', 'approved_by'],
  Media: ['media_id', 'owner_id', 'drive_file_id', 'file_name', 'mime_type', 'file_size:n', 'access_level', 'created_at', 'moderation_status'],
  Achievements: ['achievement_id', 'name', 'description', 'badge_image', 'unlock_condition', 'status'],
  UserAchievements: ['user_id', 'achievement_id', 'unlocked_at'],
  Reports: ['report_id', 'reporter_id', 'target_type', 'target_id', 'reason', 'details', 'status', 'reviewed_by', 'created_at', 'resolved_at'],
  Blocks: ['blocker_id', 'blocked_user_id', 'created_at'],
  DailyActivityLog: ['log_id', 'user_id', 'activity_type', 'activity_date', 'reference_id', 'created_at'],
  StorySessions: ['story_session_id', 'user_id', 'story_id', 'current_node_id', 'state_json', 'started_at', 'updated_at', 'completed_at'],
  Notifications: ['notification_id', 'user_id', 'title', 'message', 'notification_type', 'reference_id', 'is_read:b', 'created_at'],
  Settings: ['setting_key', 'setting_value', 'updated_at', 'updated_by'],
  AuditLogs: ['audit_id', 'actor_id', 'action', 'target_type', 'target_id', 'details_json', 'created_at']
};

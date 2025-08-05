export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  linkedin_url: string;
  campaign_type?: 'search' | 'reactions' | 'comments' | 'event' | 'csv';
  status: 'queued' | 'active' | 'paused' | 'completed' | null;
  status_message: string | null;
  total_profiles: number;
  processed_profiles: number;
  max_profiles: number;
  start_date: string | null; // ISO string from Supabase
  end_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  connection_note: string | null;
  follow_up_message: string | null;
  second_follow_up_message: string | null;
  follow_up_days: number;
  follow_up_hours: number;
  second_follow_up_days: number;
  second_follow_up_hours: number;
}

export interface LinkedInConnection {
  id: string;
  campaign_id: string;
  profile_url: string;
  display_name: string;
  first_name: string;
  last_name: string;
  headline: string;
  current_company: string;
  status: 'queued' | 'pending' | 'sent' | 'accepted' | 'rejected';
  requested_at: string;
  connected_at?: string;
  accepted_at?: string;
  rejected_at?: string;
  first_message_sent_at?: string;
  second_message_sent_at?: string;
  follow_up_message?: string;
  second_follow_up_message?: string;
  created_at: string;
  updated_at: string;
}

export interface LinkedInAccount {
  id: string;
  user_id: string;
  email: string;
  password: string;
  jsessionid?: string;
  csrf_token?: string;
  cookies?: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  campaign_id: string;
  job_type: string;
  log_level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
  created_at: string;
}

export interface PendingJob {
  id: string;
  user_id: string;
  campaign_id: string;
  job_type: string;
  quota_type: 'connections' | 'messages' | 'visits' | 'inmails';
  requested_amount: number;
  retry_count: number;
  max_retries: number;
  scheduled_for: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  linkedin_connected: boolean;
  trial_end_date: string | null;
  monthly_imports: number;
  last_import_reset: string | null;
} 
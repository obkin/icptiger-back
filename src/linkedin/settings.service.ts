import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../database/supabase.service';

export interface DailyUsage {
  connections: number;
  messages: number;
  visits: number;
  inmails: number;
  date: string;
}

export interface LinkedInSettings {
  max_connections_per_day: number;
  max_message_per_day: number;
  total_visits_per_day: number;
  max_inmails_per_day: number;
}

export interface QuotaInfo {
  remainingConnections: number;
  remainingMessages: number;
  remainingVisits: number;
  remainingInmails: number;
}

export interface PendingJob {
  id: string;
  user_id: string;
  campaign_id: string;
  job_type: 'followRequest' | 'sendMessage' | 'followResponse';
  action_type: 'connections' | 'messages' | 'visits' | 'inmails';
  requested_count: number;
  created_at: string;
  retry_count: number;
  max_retries: number;
}

@Injectable()
export class LinkedInSettingsService {
  private readonly logger = new Logger(LinkedInSettingsService.name);

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService
  ) {}

  async loadLinkedInSettings(userId: string): Promise<LinkedInSettings> {
    const { data: settings, error } = await this.supabaseService
      .getClient()
      .from('linkedin_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !settings) {
      this.logger.log(`Creating default LinkedIn settings for user ${userId}`);

      const defaultSettings: LinkedInSettings = {
        max_connections_per_day: 30,
        max_message_per_day: 50,
        total_visits_per_day: 100,
        max_inmails_per_day: 0,
      };

      const { error: insertError } = await this.supabaseService
        .getClient()
        .from('linkedin_settings')
        .insert({
          user_id: userId,
          ...defaultSettings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        this.logger.error(`Failed to create LinkedIn settings for user ${userId}:`, insertError);
        return defaultSettings;
      }

      return defaultSettings;
    }

    return settings;
  }

  async getDailyUsage(userId: string, date?: string): Promise<DailyUsage> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const { data: usage, error } = await this.supabaseService
      .getClient()
      .from('daily_usage')
      .select('*')
      .eq('user_id', userId)
      .eq('date', targetDate)
      .single();

    if (error || !usage) {
      return {
        connections: 0,
        messages: 0,
        visits: 0,
        inmails: 0,
        date: targetDate,
      };
    }

    return usage;
  }

  async getRemainingQuotas(userId: string): Promise<QuotaInfo> {
    const settings = await this.loadLinkedInSettings(userId);
    const usage = await this.getDailyUsage(userId);

    return {
      remainingConnections: Math.max(0, settings.max_connections_per_day - usage.connections),
      remainingMessages: Math.max(0, settings.max_message_per_day - usage.messages),
      remainingVisits: Math.max(0, settings.total_visits_per_day - usage.visits),
      remainingInmails: Math.max(0, settings.max_inmails_per_day - usage.inmails),
    };
  }

  async hasRemainingQuota(
    userId: string,
    actionType: 'connections' | 'messages' | 'visits' | 'inmails',
    requestedCount: number = 1
  ): Promise<boolean> {
    const quotas = await this.getRemainingQuotas(userId);
    
    switch (actionType) {
      case 'connections':
        return quotas.remainingConnections >= requestedCount;
      case 'messages':
        return quotas.remainingMessages >= requestedCount;
      case 'visits':
        return quotas.remainingVisits >= requestedCount;
      case 'inmails':
        return quotas.remainingInmails >= requestedCount;
      default:
        return false;
    }
  }

  async getMaxActionsForRun(
    userId: string,
    actionType: 'connections' | 'messages' | 'visits' | 'inmails',
    requestedCount: number
  ): Promise<number> {
    const quotas = await this.getRemainingQuotas(userId);
    
    let availableQuota: number;
    switch (actionType) {
      case 'connections':
        availableQuota = quotas.remainingConnections;
        break;
      case 'messages':
        availableQuota = quotas.remainingMessages;
        break;
      case 'visits':
        availableQuota = quotas.remainingVisits;
        break;
      case 'inmails':
        availableQuota = quotas.remainingInmails;
        break;
      default:
        return 0;
    }

    return Math.min(requestedCount, availableQuota);
  }

  async logUsageAndLimits(userId: string): Promise<void> {
    const settings = await this.loadLinkedInSettings(userId);
    const usage = await this.getDailyUsage(userId);
    const quotas = await this.getRemainingQuotas(userId);

    this.logger.log(`Usage for user ${userId}:`);
    this.logger.log(`  Connections: ${usage.connections}/${settings.max_connections_per_day} (${quotas.remainingConnections} remaining)`);
    this.logger.log(`  Messages: ${usage.messages}/${settings.max_message_per_day} (${quotas.remainingMessages} remaining)`);
    this.logger.log(`  Visits: ${usage.visits}/${settings.total_visits_per_day} (${quotas.remainingVisits} remaining)`);
    this.logger.log(`  InMails: ${usage.inmails}/${settings.max_inmails_per_day} (${quotas.remainingInmails} remaining)`);
  }

  async createPendingJob(
    userId: string,
    campaignId: string,
    jobType: 'followRequest' | 'sendMessage' | 'followResponse',
    actionType: 'connections' | 'messages' | 'visits' | 'inmails',
    requestedCount: number
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('pending_jobs')
      .insert({
        user_id: userId,
        campaign_id: campaignId,
        job_type: jobType,
        action_type: actionType,
        requested_count: requestedCount,
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
      });

    if (error) {
      this.logger.error(`Failed to create pending job:`, error);
      throw new Error('Failed to create pending job');
    }

    this.logger.log(`Created pending job for user ${userId}: ${actionType} x${requestedCount}`);
  }

  async getProcessablePendingJobs(): Promise<PendingJob[]> {
    const { data: jobs, error } = await this.supabaseService
      .getClient()
      .from('pending_jobs')
      .select('*')
      .lte('retry_count', 3)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error('Failed to fetch pending jobs:', error);
      return [];
    }

    return jobs || [];
  }

  async completePendingJob(jobId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('pending_jobs')
      .delete()
      .eq('id', jobId);

    if (error) {
      this.logger.error(`Failed to complete pending job ${jobId}:`, error);
    }
  }

  async incrementPendingJobRetry(jobId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('pending_jobs')
      .update({
        retry_count: this.supabaseService.getClient().rpc('increment_retry_count'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) {
      this.logger.error(`Failed to increment retry count for pending job ${jobId}:`, error);
    }
  }

  async cleanupOldPendingJobs(): Promise<void> {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await this.supabaseService
      .getClient()
      .from('pending_jobs')
      .delete()
      .lt('created_at', threeDaysAgo);

    if (error) {
      this.logger.error('Failed to cleanup old pending jobs:', error);
    } else {
      this.logger.log('Old pending jobs cleaned up successfully');
    }
  }
} 
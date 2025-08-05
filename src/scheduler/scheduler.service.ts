import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueueService } from '../jobs/queue.service';
import { SupabaseService } from '../database/supabase.service';
import { LinkedInSettingsService } from '../linkedin/settings.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private queueService: QueueService,
    private supabaseService: SupabaseService,
    private linkedinSettingsService: LinkedInSettingsService
  ) {}

  onModuleInit() {
    this.logger.log('LinkedIn Automation Scheduler initialized');
  }

  @Cron('*/15 * * * *', {
    name: 'follow_requests',
    timeZone: 'UTC',
  })
  async processFollowRequests() {
    this.logger.log('Starting scheduled follow request processing...');

    try {
      const campaigns = await this.getActiveCampaigns();
      
      if (!campaigns || campaigns.length === 0) {
        this.logger.log('No active campaigns found');
        return;
      }

      this.logger.log(`Found ${campaigns.length} active campaigns`);

      for (const campaign of campaigns) {
        try {
          await this.queueService.addFollowRequestJob(
            campaign.user_id,
            campaign.id,
            { importLimit: 10, maxDurationMs: 3 * 60 * 1000 }
          );

          this.logger.log(`Created follow request job for campaign ${campaign.id}`);
        } catch (error) {
          this.logger.error(`Failed to create job for campaign ${campaign.id}:`, error);
        }
      }

    } catch (error) {
      this.logger.error('Error in scheduled follow request processing:', error);
    }
  }

  @Cron('*/13 * * * *', {
    name: 'follow_responses',
    timeZone: 'UTC',
  })
  async processFollowResponses() {
    this.logger.log('Starting scheduled follow response processing...');

    try {
      const activeUsers = await this.getActiveUsers();
      
      if (!activeUsers || activeUsers.length === 0) {
        this.logger.log('No active users found');
        return;
      }

      this.logger.log(`Found ${activeUsers.length} active users`);

      for (const user of activeUsers) {
        try {
          await this.queueService.addFollowResponseJob(user.user_id, 'system');
          this.logger.log(`Created follow response job for user ${user.user_id}`);
        } catch (error) {
          this.logger.error(`Failed to create follow response job for user ${user.user_id}:`, error);
        }
      }

    } catch (error) {
      this.logger.error('Error in scheduled follow response processing:', error);
    }
  }

  @Cron('0 * * * *', {
    name: 'pending_jobs',
    timeZone: 'UTC',
  })
  async processPendingJobs() {
    this.logger.log('Starting scheduled pending jobs processing...');

    try {
      const pendingJobs = await this.linkedinSettingsService.getProcessablePendingJobs();
      
      if (!pendingJobs || pendingJobs.length === 0) {
        this.logger.log('No processable pending jobs found');
        return;
      }

      this.logger.log(`Found ${pendingJobs.length} processable pending jobs`);

      for (const pendingJob of pendingJobs) {
        try {
                     await this.queueService.addJob(
             'processPendingJobs',
             pendingJob.user_id,
             'system',
             { 
               pendingJobId: pendingJob.id,
               actionType: pendingJob.action_type,
               requestedCount: pendingJob.requested_count
             }
           );

          this.logger.log(`Created processing job for pending job ${pendingJob.id}`);
        } catch (error) {
          this.logger.error(`Failed to create processing job for pending job ${pendingJob.id}:`, error);
        }
      }

    } catch (error) {
      this.logger.error('Error in scheduled pending jobs processing:', error);
    }
  }

  @Cron('0 2 * * *', {
    name: 'cleanup_old_pending_jobs',
    timeZone: 'UTC',
  })
  async cleanupOldPendingJobs() {
    this.logger.log('Starting cleanup of old pending jobs...');

    try {
      await this.linkedinSettingsService.cleanupOldPendingJobs();
      this.logger.log('Old pending jobs cleanup completed');
    } catch (error) {
      this.logger.error('Error during old pending jobs cleanup:', error);
    }
  }

  @Cron('0 * * * *', {
    name: 'system_stats',
    timeZone: 'UTC',
  })
  async logSystemStats() {
    this.logger.log('Logging system statistics...');

    try {
      const queueStats = await this.queueService.getQueueStats();
      this.logger.log(`Queue Stats - Waiting: ${queueStats.waiting}, Active: ${queueStats.active}, Completed: ${queueStats.completed}, Failed: ${queueStats.failed}`);
    } catch (error) {
      this.logger.error('Error logging system stats:', error);
    }
  }

  private async getActiveCampaigns() {
    const { data: campaigns, error } = await this.supabaseService
      .getClient()
      .from('linkedin_campaigns')
      .select('id, user_id, status, linkedin_url, campaign_type')
      .eq('status', 'active');

    if (error) {
      this.logger.error('Error fetching active campaigns:', error);
      return [];
    }

    return campaigns || [];
  }

  private async getActiveUsers() {
    const { data: users, error } = await this.supabaseService
      .getClient()
      .from('linkedin_campaigns')
      .select('user_id')
      .eq('status', 'active');

    if (error) {
      this.logger.error('Error fetching active users:', error);
      return [];
    }

    const uniqueUsers = Array.from(
      new Set(users?.map(u => u.user_id) || [])
    ).map(user_id => ({ user_id }));

    return uniqueUsers;
  }
} 
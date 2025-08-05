import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { Job } from 'bullmq';
import { JobData } from '../queue.service';

@Injectable()
export abstract class BaseProcessor {
  protected readonly logger = new Logger(BaseProcessor.name);

  constructor(protected supabaseService: SupabaseService) {}

  protected async getCampaign(campaignId: string) {
    try {
      const campaign = await this.supabaseService.getCampaign(campaignId);
      
      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      return campaign;
    } catch (error) {
      this.logger.error(`Failed to get campaign ${campaignId}:`, error);
      throw error;
    }
  }

  protected async getLinkedInAccount(userId: string) {
    try {
      const account = await this.supabaseService.getLinkedInAccount(userId);
      
      if (!account) {
        throw new Error(`LinkedIn account not found for user ${userId}`);
      }

      return account;
    } catch (error) {
      this.logger.error(`Failed to get LinkedIn account for user ${userId}:`, error);
      throw error;
    }
  }

  protected async checkTrialStatus(userId: string): Promise<boolean> {
    try {
      const profile = await this.supabaseService.getClient()
        .from('profiles')
        .select('created_at')
        .eq('id', userId)
        .single();

      if (profile.error || !profile.data) {
        this.logger.warn(`Profile not found for user ${userId}`);
        return false;
      }

      const createdAt = new Date(profile.data.created_at);
      const now = new Date();
      const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

      return daysSinceCreation <= 7;
    } catch (error) {
      this.logger.error(`Error checking trial status for user ${userId}:`, error);
      return false;
    }
  }

  protected isCampaignActive(campaign: any): boolean {
    return campaign.status === 'active';
  }

  protected async logActivity(
    userId: string,
    campaignId: string,
    jobType: string,
    logLevel: 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    try {
      await this.supabaseService.logActivity({
        user_id: userId,
        campaign_id: campaignId,
        job_type: jobType,
        log_level: logLevel,
        message,
        context,
      });
    } catch (error) {
      this.logger.error('Failed to log activity:', error);
    }
  }

  protected async handleJobError(job: Job<JobData>, error: any): Promise<void> {
    const { userId, campaignId, jobType } = job.data;
    
    this.logger.error(`Job ${job.id} failed:`, error);
    
    await this.logActivity(
      userId,
      campaignId,
      jobType,
      'error',
      `Job failed: ${error.message}`,
      { error: error.stack, jobId: job.id }
    );
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected personalizeMessage(
    template: string,
    fullName: string,
    company?: string
  ): string {
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');
    
    return template
      .replace(/\{\{firstName\}\}/g, firstName)
      .replace(/\{\{lastName\}\}/g, lastName)
      .replace(/\{\{fullName\}\}/g, fullName)
      .replace(/\{\{company\}\}/g, company || '');
  }
} 
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BaseProcessor } from './base.processor';
import { JobData } from '../queue.service';
import { SupabaseService } from '../../database/supabase.service';
import { LinkedInSettingsService } from '../../linkedin/settings.service';
import { LinkedInAutomationService } from '../../linkedin/automation.service';
import { Campaign, LinkedInConnection } from '../../common/types/campaign.types';

@Injectable()
export class FollowResponseProcessor extends BaseProcessor {
  protected readonly logger = new Logger(FollowResponseProcessor.name);

  constructor(
    supabaseService: SupabaseService,
    private linkedinSettingsService: LinkedInSettingsService,
    private linkedinAutomationService: LinkedInAutomationService
  ) {
    super(supabaseService);
  }

  async process(job: Job<JobData>): Promise<void> {
    const { userId, campaignId, data } = job.data;
    
    this.logger.log(`🔄 Processing follow response job for user ${userId}, campaign ${campaignId}`);

    try {
      // Check trial status
      const isInTrial = await this.checkTrialStatus(userId);
      if (!isInTrial) {
        this.logger.log(`🚫 User ${userId} is past their 7-day trial`);
        return;
      }

      // Get campaigns for this user
      const campaigns = await this.getActiveCampaignsForUser(userId);
      
      if (!campaigns || campaigns.length === 0) {
        this.logger.log(`No active campaigns found for user ${userId}`);
        return;
      }

      const { default: pLimit } = await import('p-limit');
      const limit = pLimit(10);

      const promises = campaigns.map((campaign) =>
        limit(() => this.processCampaignFollowResponse(campaign))
      );

      await Promise.all(promises);

      this.logger.log(`✅ Follow response processing completed for user ${userId}`);

    } catch (error) {
      await this.handleJobError(job, error);
      throw error;
    }
  }

  /**
   * Get active campaigns for user
   */
  private async getActiveCampaignsForUser(userId: string): Promise<Campaign[]> {
    const now = new Date();
    const nowTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();

    const { data: campaigns, error } = await this.supabaseService
      .getClient()
      .from('linkedin_campaigns')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'paused'])
      .lte('start_date', nowTime)
      .or(`end_date.gte.${nowTime},end_date.is.null`);

    if (error) {
      this.logger.error('Error fetching campaigns:', error);
      return [];
    }

    return (campaigns || []) as Campaign[];
  }

  /**
   * Process follow response for a single campaign
   */
  private async processCampaignFollowResponse(campaign: Campaign): Promise<void> {
    const now = new Date();
    
    // Check if campaign is within date range
    if (campaign.start_date && new Date(campaign.start_date) > now) return;
    if (campaign.end_date && new Date(campaign.end_date) < now) return;

    // Check if user is in trial
    const profile = await this.getUserProfile(campaign.user_id);
    if (!profile) {
      this.logger.warn(`Could not load profile for user ${campaign.user_id}, skipping trial check.`);
      return;
    }

    const createdAt = new Date(profile.created_at);
    const trialEndDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    if (now > trialEndDate) {
      this.logger.log(`🚫 User ${campaign.user_id} is past their 7-day trial period`);
      return;
    }

    // Get LinkedIn account
    const accountData = await this.getLinkedInAccount(campaign.user_id);

    // Check message limits
    const quotas = await this.linkedinSettingsService.getRemainingQuotas(campaign.user_id);
    if (quotas.remainingMessages <= 0) {
      this.logger.log(`🚫 User ${campaign.user_id} has reached daily message limit`);
      return;
    }

    // Get connections that need follow-up messages
    const connectionsNeedingFollowUp = await this.getConnectionsNeedingFollowUp(campaign);
    
    if (connectionsNeedingFollowUp.length === 0) {
      this.logger.log(`No connections need follow-up for campaign ${campaign.id}`);
      return;
    }

    this.logger.log(`Found ${connectionsNeedingFollowUp.length} connections needing follow-up for campaign ${campaign.id}`);

    // Process follow-up messages
    await this.linkedinAutomationService.runWithLogin(
      campaign,
      accountData,
      async ({ page }) => {
        await this.sendFollowUpMessages(page, campaign, connectionsNeedingFollowUp, quotas.remainingMessages);
      }
    );
  }

  /**
   * Get connections that need follow-up messages
   */
  private async getConnectionsNeedingFollowUp(campaign: Campaign): Promise<LinkedInConnection[]> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Get connections that were accepted 3+ days ago and haven't received first follow-up
    const { data: firstFollowUpConnections, error: firstError } = await this.supabaseService
      .getClient()
      .from('linkedin_connections')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'accepted')
      .is('first_message_sent_at', null)
      .lte('connected_at', threeDaysAgo.toISOString())
      .not('follow_up_message', 'is', null)
      .limit(5);

    if (firstError) {
      this.logger.error('Error fetching first follow-up connections:', firstError);
      return [];
    }

    // Get connections that received first follow-up 7+ days ago and need second follow-up
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: secondFollowUpConnections, error: secondError } = await this.supabaseService
      .getClient()
      .from('linkedin_connections')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'accepted')
      .not('first_message_sent_at', 'is', null)
      .is('second_message_sent_at', null)
      .lte('first_message_sent_at', sevenDaysAgo.toISOString())
      .not('second_follow_up_message', 'is', null)
      .limit(3);

    if (secondError) {
      this.logger.error('Error fetching second follow-up connections:', secondError);
      return [];
    }

    const allConnections = [
      ...(firstFollowUpConnections || []),
      ...(secondFollowUpConnections || [])
    ];

    return allConnections as LinkedInConnection[];
  }

  /**
   * Send follow-up messages
   */
  private async sendFollowUpMessages(
    page: any,
    campaign: Campaign,
    connections: LinkedInConnection[],
    messageLimit: number
  ): Promise<void> {
    let messagesSent = 0;

    for (const connection of connections) {
      if (messagesSent >= messageLimit) {
        this.logger.log(`Reached message limit (${messageLimit}) for user ${campaign.user_id}`);
        break;
      }

      try {
        // Determine message type and content
        const isFirstFollowUp = !connection.first_message_sent_at;
        const messageTemplate = isFirstFollowUp 
          ? campaign.follow_up_message 
          : campaign.second_follow_up_message;

        if (!messageTemplate) {
          this.logger.warn(`No message template for connection ${connection.id}`);
          continue;
        }

        // Personalize message
        const personalizedMessage = this.linkedinAutomationService.personalizeMessage(
          messageTemplate,
          connection.display_name || connection.first_name || 'there',
          connection.current_company || ''
        );

        // Send message via LinkedIn
        await this.linkedinAutomationService.sendMessage(
          page,
          connection.profile_url,
          personalizedMessage
        );

        // Update database
        const updateData = isFirstFollowUp
          ? { first_message_sent_at: new Date().toISOString() }
          : { second_message_sent_at: new Date().toISOString() };

        await this.supabaseService
          .getClient()
          .from('linkedin_connections')
          .update(updateData)
          .eq('id', connection.id);

        // Log activity
        await this.logActivity(
          campaign.user_id,
          campaign.id,
          'followResponse',
          'info',
          `${isFirstFollowUp ? 'First' : 'Second'} follow-up message sent to ${connection.display_name}`,
          { 
            profile: connection.profile_url,
            messageType: isFirstFollowUp ? 'first_followup' : 'second_followup'
          }
        );

        messagesSent++;
        this.logger.log(`Sent ${isFirstFollowUp ? 'first' : 'second'} follow-up to ${connection.display_name}`);

        // Human-like delay
        await this.delay(Math.floor(Math.random() * (15000 - 5000 + 1)) + 5000);

      } catch (error) {
        this.logger.error(`Error sending follow-up to ${connection.display_name}:`, error);
        
        await this.logActivity(
          campaign.user_id,
          campaign.id,
          'followResponse',
          'error',
          `Failed to send follow-up message to ${connection.display_name}`,
          { 
            error: error.message,
            profile: connection.profile_url
          }
        );
      }
    }

    this.logger.log(`Sent ${messagesSent} follow-up messages for campaign ${campaign.id}`);
  }

  /**
   * Get user profile
   */
  private async getUserProfile(userId: string) {
    const { data: profile, error } = await this.supabaseService
      .getClient()
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .single();

    if (error) {
      this.logger.error(`Error getting user profile:`, error);
      return null;
    }

    return profile;
  }
} 
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { shuffle } from 'lodash';
import { BaseProcessor } from './base.processor';
import { JobData } from '../queue.service';
import { SupabaseService } from '../../database/supabase.service';
import { LinkedInSettingsService } from '../../linkedin/settings.service';
import { LinkedInAutomationService } from '../../linkedin/automation.service';
import { Campaign, LinkedInConnection } from '../../common/types/campaign.types';
import { Page } from 'puppeteer';

@Injectable()
export class FollowRequestProcessor extends BaseProcessor {
  protected readonly logger = new Logger(FollowRequestProcessor.name);

  constructor(
    supabaseService: SupabaseService,
    private linkedinSettingsService: LinkedInSettingsService,
    private linkedinAutomationService: LinkedInAutomationService
  ) {
    super(supabaseService);
  }

  async process(job: Job<JobData>): Promise<void> {
    const { userId, campaignId, data } = job.data;
    
    this.logger.log(`🕐 Processing follow request job for user ${userId}, campaign ${campaignId}`);

    try {
      // Check trial status
      const isInTrial = await this.checkTrialStatus(userId);
      if (!isInTrial) {
        this.logger.log(`🚫 User ${userId} is past their 7-day trial`);
        return;
      }

      // Get campaign
      const campaign = await this.getCampaign(campaignId);
      
      // Check if campaign is still active
      if (!this.isCampaignActive(campaign)) {
        this.logger.log(`Campaign ${campaignId} is not active, skipping`);
        return;
      }

      // Get LinkedIn account
      const accountData = await this.getLinkedInAccount(userId);

      // Load settings and check limits
      await this.linkedinSettingsService.logUsageAndLimits(userId);

      const importLimit = data?.importLimit || 10;
      const maxDurationMs = data?.maxDurationMs || 3 * 60 * 1000;

      const maxConnectionsForRun = await this.linkedinSettingsService.getMaxActionsForRun(
        userId,
        'connections',
        importLimit
      );

      const quotas = await this.linkedinSettingsService.getRemainingQuotas(userId);

      this.logger.log(`📊 Connection limits for this run: ${maxConnectionsForRun} (requested: ${importLimit})`);
      this.logger.log(`📊 Remaining messages today: ${quotas.remainingMessages}`);

      if (maxConnectionsForRun <= 0) {
        this.logger.log(`🚫 User ${userId} has reached daily connection limit. Creating pending job.`);

        await this.linkedinSettingsService.createPendingJob(
          userId,
          campaignId,
          'followRequest',
          'connections',
          importLimit
        );

        await this.logActivity(
          userId,
          campaignId,
          'followRequest',
          'info',
          `Daily connection limit reached. Job queued for next day.`,
          { requested_connections: importLimit }
        );

        return;
      }

      // Execute follow request automation
      await this.linkedinAutomationService.runWithLogin(
        campaign,
        accountData,
        async ({ page }) => {
          await this.sendFollowRequests({ page, campaign, importLimit: maxConnectionsForRun, maxDurationMs });
        }
      );

      this.logger.log(`✅ Follow request completed for campaign ${campaignId}`);

    } catch (error) {
      await this.handleJobError(job, error);
      throw error;
    }
  }

  /**
   * Main follow request logic
   */
  private async sendFollowRequests({
    page,
    campaign,
    importLimit = 10,
    maxDurationMs = 3 * 60 * 1000,
  }: {
    page: Page;
    campaign: Campaign;
    importLimit?: number;
    maxDurationMs?: number;
  }): Promise<void> {
    this.logger.log(`🔗 Starting follow requests for campaign ${campaign.id}`);
    const startTime = Date.now();

    // Count existing connections
    const { count: followedCount } = await this.supabaseService
      .getClient()
      .from('linkedin_connections')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id);

    let followed = followedCount || 0;

    if (!campaign.linkedin_url && campaign.campaign_type !== 'csv') {
      this.logger.warn(`No LinkedIn URL found for campaign ${campaign.id}`);
      return;
    }

    const campaignType = campaign.campaign_type || 'search';
    this.logger.log(`Processing campaign type: ${campaignType}`);

    // Dispatch to appropriate handler based on campaign type
    switch (campaignType) {
      case 'search':
        followed = await this.processSearchCampaign(page, campaign, followed, importLimit, maxDurationMs, startTime);
        break;
      case 'reactions':
        followed = await this.processReactionsCampaign(page, campaign, followed, importLimit, maxDurationMs, startTime);
        break;
      case 'comments':
        followed = await this.processCommentsCampaign(page, campaign, followed, importLimit, maxDurationMs, startTime);
        break;
      case 'event':
        followed = await this.processEventCampaign(page, campaign, followed, importLimit, maxDurationMs, startTime);
        break;
      case 'csv':
        followed = await this.processCsvCampaign(page, campaign, followed, importLimit, maxDurationMs, startTime);
        break;
      default:
        throw new Error(`Unsupported campaign type: ${campaignType}`);
    }

    this.logger.log(`🏁 Follow requests completed. Processed ${followed} profiles.`);
  }

  /**
   * Process search-based campaign
   */
  private async processSearchCampaign(
    page: Page,
    campaign: Campaign,
    followed: number,
    importLimit: number,
    maxDurationMs: number,
    startTime: number
  ): Promise<number> {
    await page.goto(campaign.linkedin_url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.delay(5000);
    await page.waitForSelector('ul[role="list"]', { timeout: 30000 });

    while (
      followed < campaign.total_profiles &&
      followed < importLimit &&
      Date.now() - startTime < maxDurationMs
    ) {
      // Extract people from current page
      const people = await page.$$eval('ul[role="list"] > li', (items: any[]) =>
        items.map((li) => {
          const anchor = li.querySelector('a[href^="https://www.linkedin.com/in"]');
          const url = anchor?.href.split('?')[0] || '';
          const name = li.querySelector('span[dir="ltr"]')?.innerText.split(' View')[0].trim() || '';
          const headline = li.querySelector('div.t-14.t-black.t-normal')?.innerText.trim() || '';
          const companyMatch = li.querySelector('p.entity-result__summary--2-lines')?.innerText.match(/Current:\s*(?:.*? at )?(.+)$/i);
          
          return { 
            url, 
            name, 
            headline, 
            company: companyMatch?.[1] || '' 
          };
        })
      );

      this.logger.log(`Found ${people.length} people on current page`);

      // Process each person
      for (const person of people) {
        if (followed >= importLimit || Date.now() - startTime > maxDurationMs) break;

        const processed = await this.processPersonConnection(page, person, campaign);
        if (processed) {
          followed++;
          await this.updateCampaignProcessedCount(campaign.id, followed);
        }
      }

      // Navigate to next page
      const hasNext = await this.goToNextPage(page);
      if (!hasNext) break;
    }

    return followed;
  }

  /**
   * Process reactions-based campaign
   */
  private async processReactionsCampaign(
    page: Page,
    campaign: Campaign,
    followed: number,
    importLimit: number,
    maxDurationMs: number,
    startTime: number
  ): Promise<number> {
    // Extract post ID and navigate to reactions page
    const postMatch = campaign.linkedin_url.match(/activity-(\d+)/);
    if (!postMatch?.[1]) {
      throw new Error('Post ID not found in campaign LinkedIn URL');
    }

    const postId = postMatch[1];
    const reactionsUrl = `https://www.linkedin.com/analytics/post/urn:li:activity:${postId}/?resultType=REACTIONS`;
    
    await page.goto(reactionsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.delay(5000);
    await page.waitForSelector('ul.artdeco-list', { timeout: 30000 });

    // Scroll and process reactors
    while (followed < importLimit && Date.now() - startTime < maxDurationMs) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await this.delay(2000);

      const people = await this.extractReactorsFromPage(page);
      this.logger.log(`🔍 Found ${people.length} reactors on this page`);

      for (const person of people) {
        if (followed >= importLimit || Date.now() - startTime >= maxDurationMs) break;

        const processed = await this.processPersonConnectionViaSearch(page, person, campaign);
        if (processed) {
          followed++;
          await this.updateCampaignProcessedCount(campaign.id, followed);
        }
      }
    }

    return followed;
  }

  /**
   * Process comments-based campaign
   */
  private async processCommentsCampaign(
    page: Page,
    campaign: Campaign,
    followed: number,
    importLimit: number,
    maxDurationMs: number,
    startTime: number
  ): Promise<number> {
    // Similar to reactions but for comments
    const postMatch = campaign.linkedin_url.match(/activity-(\d+)/);
    if (!postMatch?.[1]) {
      throw new Error('Post ID not found in campaign LinkedIn URL');
    }

    const postId = postMatch[1];
    const commentsUrl = `https://www.linkedin.com/analytics/post/urn:li:activity:${postId}/?resultType=COMMENTS`;
    
    await page.goto(commentsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.delay(5000);
    await page.waitForSelector('ul.artdeco-list', { timeout: 30000 });

    // Process similar to reactions
    while (followed < importLimit && Date.now() - startTime < maxDurationMs) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await this.delay(2000);

      const people = await this.extractCommentersFromPage(page);
      this.logger.log(`🔍 Found ${people.length} commenters on this page`);

      for (const person of people) {
        if (followed >= importLimit || Date.now() - startTime >= maxDurationMs) break;

        const processed = await this.processPersonConnectionViaSearch(page, person, campaign);
        if (processed) {
          followed++;
          await this.updateCampaignProcessedCount(campaign.id, followed);
        }
      }
    }

    return followed;
  }

  /**
   * Process event-based campaign
   */
  private async processEventCampaign(
    page: Page,
    campaign: Campaign,
    followed: number,
    importLimit: number,
    maxDurationMs: number,
    startTime: number
  ): Promise<number> {
    // Extract event ID and construct attendees URL
    const eventMatch = campaign.linkedin_url.match(/\/events\/(\d+)/);
    if (!eventMatch?.[1]) {
      throw new Error('Event ID not found in campaign LinkedIn URL');
    }

    const eventId = eventMatch[1];
    const encodedEventId = encodeURIComponent(`["${eventId}"]`);
    const attendeesUrl = `https://www.linkedin.com/search/results/people/?eventAttending=${encodedEventId}&origin=EVENT_PAGE_CANNED_SEARCH&sid=dx8`;

    await page.goto(attendeesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.delay(5000);
    await page.waitForSelector('ul[role="list"]', { timeout: 30000 });

    // Process similar to search campaign
    while (
      followed < campaign.total_profiles &&
      followed < importLimit &&
      Date.now() - startTime < maxDurationMs
    ) {
      const people = await this.extractPeopleFromSearchResults(page);
      this.logger.log(`Found ${people.length} event attendees on current page`);

      for (const person of people) {
        if (followed >= importLimit || Date.now() - startTime > maxDurationMs) break;

        const processed = await this.processPersonConnection(page, person, campaign);
        if (processed) {
          followed++;
          await this.updateCampaignProcessedCount(campaign.id, followed);
        }
      }

      const hasNext = await this.goToNextPage(page);
      if (!hasNext) break;
    }

    return followed;
  }

  /**
   * Process CSV-based campaign
   */
  private async processCsvCampaign(
    page: Page,
    campaign: Campaign,
    followed: number,
    importLimit: number,
    maxDurationMs: number,
    startTime: number
  ): Promise<number> {
    // Fetch queued profiles from database
    const { data: queuedProfiles, error } = await this.supabaseService
      .getClient()
      .from('linkedin_connections')
      .select('id, profile_url, display_name, current_company')
      .eq('campaign_id', campaign.id)
      .in('status', ['queued', 'pending'])
      .order('requested_at', { ascending: true })
      .limit(importLimit);

    if (error || !queuedProfiles?.length) {
      this.logger.log('✅ No queued CSV profiles left for this campaign.');
      return followed;
    }

    this.logger.log(`🔍 Processing ${queuedProfiles.length} queued CSV profiles...`);

    for (const profile of queuedProfiles) {
      if (Date.now() - startTime > maxDurationMs) break;

      const processed = await this.processCsvProfile(page, profile, campaign);
      if (processed) {
        followed++;
        await this.updateCampaignProcessedCount(campaign.id, followed);
      }
    }

    return followed;
  }

  /**
   * Process individual person connection
   */
  private async processPersonConnection(
    page: Page,
    person: { url: string; name: string; headline: string; company: string },
    campaign: Campaign
  ): Promise<boolean> {
    try {
      // Check if already processed
      const existing = await this.supabaseService
        .getClient()
        .from('linkedin_connections')
        .select('id')
        .eq('profile_url', person.url)
        .eq('campaign_id', campaign.id)
        .maybeSingle();

      if (existing.data) {
        this.logger.debug(`Skipping ${person.name}, already processed`);
        return false;
      }

      // Find the profile card and buttons
      const baseUrl = person.url;
      const profileId = baseUrl.split('/').pop();
      if (!profileId) return false;

      const liHandle = await page.$(`li:has(a[href^="${baseUrl}"])`) || 
                        await page.$(`li[data-chameleon-result-urn*="${profileId}"]`);
      if (!liHandle) return false;

      const followBtn = await liHandle.$('button[aria-label^="Follow"]');
      const connectBtn = await liHandle.$('button[aria-label^="Invite"]');

      const firstName = person.name.split(' ')[0];
      const connectionName = person.name.trim().split(/\s+/).slice(0, 2).join(' ');

      let actionMessage = '';

      if (followBtn) {
        await followBtn.click();
        await this.delay(5000);
        actionMessage = `You have followed ${connectionName}.`;
      } else if (connectBtn) {
        await connectBtn.click();
        await this.delay(5000);
        
        // Handle connection note
        if (campaign.connection_note) {
          try {
            await page.waitForSelector('button[aria-label="Add a note"]', { timeout: 10000 });
            await page.click('button[aria-label="Add a note"]');
            await this.delay(5000);
            
            await page.waitForSelector('textarea', { timeout: 10000 });
            const personalizedMessage = this.personalizeMessage(
              campaign.connection_note,
              person.name,
              person.company
            ).slice(0, 200);
            
            await page.type('textarea', personalizedMessage, { delay: 300 });
            await page.click('button[aria-label="Send invitation"]');
            actionMessage = `Your invitation with note has been sent to ${connectionName}.`;
          } catch {
            await page.click('button[aria-label="Send without a note"]');
            actionMessage = `Your invitation without note has been sent to ${connectionName}.`;
          }
        } else {
          await page.click('button[aria-label="Send without a note"]');
          actionMessage = `Your invitation without note has been sent to ${connectionName}.`;
        }
        
        await this.delay(5000);
      } else {
        this.logger.log(`❌ No follow/connect button found for ${person.name}`);
        return false;
      }

      // Save connection to database
      await this.supabaseService
        .getClient()
        .from('linkedin_connections')
        .insert({
          campaign_id: campaign.id,
          profile_url: person.url,
          headline: person.headline,
          current_company: person.company,
          requested_at: new Date().toISOString(),
          display_name: person.name,
          first_name: person.name.split(' ')[0],
          last_name: person.name.split(' ').slice(1).join(' '),
          status: 'queued',
        });

      // Log activity
      await this.logActivity(
        campaign.user_id,
        campaign.id,
        'followRequest',
        'info',
        actionMessage,
        { profile: baseUrl }
      );

      await this.delay(5000);
      return true;

    } catch (error) {
      this.logger.error(`Error processing person ${person.name}:`, error);
      await this.logActivity(
        campaign.user_id,
        campaign.id,
        'followRequest',
        'error',
        'Error processing profile of the contact',
        { error: error.message, profile: person.url }
      );
      return false;
    }
  }

  /**
   * Extract people from search results
   */
  private async extractPeopleFromSearchResults(page: Page) {
    return page.$$eval('ul[role="list"] > li', (items: any[]) =>
      items.map((li) => {
        const anchor = li.querySelector('a[href^="https://www.linkedin.com/in"]');
        const url = anchor?.href.split('?')[0] || '';
        const name = li.querySelector('span[dir="ltr"]')?.innerText.split(' View')[0].trim() || '';
        const headline = li.querySelector('div.t-14.t-black.t-normal')?.innerText.trim() || '';
        const companyMatch = li.querySelector('p.entity-result__summary--2-lines')?.innerText.match(/Current:\s*(?:.*? at )?(.+)$/i);
        
        return { url, name, headline, company: companyMatch?.[1] || '' };
      })
    );
  }

  /**
   * Extract reactors from reactions page
   */
  private async extractReactorsFromPage(page: Page) {
    return page.$$eval('ul.artdeco-list > li', (items: any[]) =>
      items.map((li) => {
        const a = li.querySelector('a[href^="https://www.linkedin.com/in/"]');
        return {
          url: a?.href.split('?')[0] ?? '',
          name: li.querySelector('span[dir="ltr"]')?.innerText.trim() ?? '',
          headline: li.querySelector('div.t-14.t-black.t-normal')?.innerText.trim() ?? '',
          company: li.querySelector('p.entity-result__summary--2-lines')?.innerText.match(/Current:\s*(?:.*? at )?(.+)$/i)?.[1] || '',
        };
      })
    );
  }

  /**
   * Extract commenters from comments page
   */
  private async extractCommentersFromPage(page: Page) {
    return this.extractReactorsFromPage(page); // Same structure
  }

  /**
   * Process person connection via search (for reactions/comments)
   */
  private async processPersonConnectionViaSearch(
    page: Page,
    person: { url: string; name: string; headline: string; company: string },
    campaign: Campaign
  ): Promise<boolean> {
    try {
      // Navigate to person's profile to get clean URL
      const targetUrl = person.url.replace(/\/+$/g, '');
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.delay(2000);

      const cleanUrl = page.url().replace(/\/+$/g, '');

      // Search for person by name
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        person.name.split('View')[0].trim()
      )}&origin=SWITCH_SEARCH_VERTICAL`;

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.delay(5000);
      await page.waitForSelector('ul[role="list"]', { timeout: 30000 });

      // Find matching result
      const results = await page.$$eval('ul[role="list"] > li', (items: any[]) =>
        items.map((li) => {
          const a = li.querySelector('a[href^="https://www.linkedin.com/in/"]');
          return { url: a?.href.split('?')[0].replace(/\/+$/g, '') ?? '' };
        })
      );

      const match = results.find((r) => r.url === cleanUrl);
      if (!match) {
        this.logger.warn(`⚠️ No search match for ${person.name} (${cleanUrl})`);
        return false;
      }

      // Process connection on search results page
      return this.processPersonConnection(page, { ...person, url: match.url }, campaign);

    } catch (error) {
      this.logger.error(`Error processing person via search ${person.name}:`, error);
      return false;
    }
  }

  /**
   * Process CSV profile
   */
  private async processCsvProfile(
    page: Page,
    profile: { id: string; profile_url: string; display_name: string; current_company: string },
    campaign: Campaign
  ): Promise<boolean> {
    try {
      const { id, profile_url, display_name, current_company } = profile;
      const sanitizedUrl = profile_url.endsWith('/') ? profile_url.slice(0, -1) : profile_url;

      // Search for person
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        display_name
      )}&origin=SWITCH_SEARCH_VERTICAL`;

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.delay(5000);
      await page.waitForSelector('ul[role="list"]', { timeout: 30000 });

      const people = await this.extractPeopleFromSearchResults(page);
      const match = people.find((p) => p.url === sanitizedUrl);

      if (!match) {
        this.logger.warn(`⚠️ No search match for ${display_name} (${profile_url})`);
        return false;
      }

      // Process connection
      const success = await this.processPersonConnection(page, match, campaign);

      if (success) {
        // Mark CSV row as sent
        await this.supabaseService
          .getClient()
          .from('linkedin_connections')
          .update({ 
            status: 'sent', 
            requested_at: new Date().toISOString() 
          })
          .eq('id', id);
      }

      return success;

    } catch (error) {
      this.logger.error(`Error processing CSV profile:`, error);
      return false;
    }
  }

  /**
   * Navigate to next page in search results
   */
  private async goToNextPage(page: Page): Promise<boolean> {
    try {
      // Scroll to load more items
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await this.delay(2000);

      const nextBtn = await page.$('button[aria-label="Next"]');
      if (!nextBtn) {
        this.logger.debug('No Next button found');
        return false;
      }

      const disabled = await nextBtn.evaluate((btn: any) => btn.disabled);
      if (disabled) {
        this.logger.debug('Next button is disabled');
        return false;
      }

      await nextBtn.click();
      await this.delay(1000);
      return true;
    } catch (error) {
      this.logger.debug('Error navigating to next page:', error);
      return false;
    }
  }

  /**
   * Update campaign processed count
   */
  private async updateCampaignProcessedCount(campaignId: string, count: number): Promise<void> {
    await this.supabaseService
      .getClient()
      .from('linkedin_campaigns')
      .update({ processed_profiles: count })
      .eq('id', campaignId);
  }
} 
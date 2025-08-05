import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ActivityLogData {
  user_id: string;
  campaign_id: string;
  job_type: string;
  log_level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
}

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('supabase.url');
    const supabaseKey = this.configService.get<string>('supabase.key');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration is missing');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.logger.log('Supabase client initialized');
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('linkedin_campaigns')
        .select('count', { count: 'exact', head: true });

      if (error) {
        this.logger.error('Database connection test failed:', error);
        return false;
      }

      this.logger.log('Database connection test successful');
      return true;
    } catch (error) {
      this.logger.error('Database connection test failed:', error);
      return false;
    }
  }

  async logActivity(activityData: ActivityLogData): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('activity_logs')
        .insert({
          ...activityData,
          created_at: new Date().toISOString(),
        });

      if (error) {
        this.logger.error('Failed to log activity:', error);
      }
    } catch (error) {
      this.logger.error('Failed to log activity:', error);
    }
  }

  async getCampaign(campaignId: string) {
    const { data, error } = await this.supabase
      .from('linkedin_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error) {
      this.logger.error(`Failed to get campaign ${campaignId}:`, error);
      throw error;
    }

    return data;
  }

  async getLinkedInAccount(userId: string) {
    const { data, error } = await this.supabase
      .from('linkedin_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      this.logger.error(`Failed to get LinkedIn account for user ${userId}:`, error);
      throw error;
    }

    return data;
  }

  async getLinkedInConnections(campaignId: string, limit?: number) {
    let query = this.supabase
      .from('linkedin_connections')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to get LinkedIn connections for campaign ${campaignId}:`, error);
      throw error;
    }

    return data || [];
  }

  async createLinkedInConnection(connectionData: any) {
    const { data, error } = await this.supabase
      .from('linkedin_connections')
      .insert(connectionData)
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create LinkedIn connection:', error);
      throw error;
    }

    return data;
  }

  async updateLinkedInConnection(connectionId: string, updates: any) {
    const { data, error } = await this.supabase
      .from('linkedin_connections')
      .update(updates)
      .eq('id', connectionId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update LinkedIn connection ${connectionId}:`, error);
      throw error;
    }

    return data;
  }
} 
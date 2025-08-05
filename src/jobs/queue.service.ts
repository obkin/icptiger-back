import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Job } from 'bullmq';

export interface JobData {
  userId: string;
  campaignId: string;
  jobType: 'followRequest' | 'followResponse' | 'sendMessages' | 'processPendingJobs' | 'processSingleCampaign';
  data?: Record<string, any>;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queue: Queue<JobData>;

  constructor(private configService: ConfigService) {
    const redisConfig = {
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
    };

    this.queue = new Queue<JobData>('linkedin-automation', {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }

  onModuleInit() {
    this.logger.log('Queue service initialized');
  }

  async onModuleDestroy() {
    await this.queue.close();
    this.logger.log('Queue service destroyed');
  }

  async addJob(
    jobType: JobData['jobType'],
    userId: string,
    campaignId: string,
    data?: Record<string, any>
  ): Promise<Job<JobData>> {
    const jobData: JobData = {
      userId,
      campaignId,
      jobType,
      data,
    };

    const job = await this.queue.add(jobType, jobData);
    this.logger.log(`Added ${jobType} job for user ${userId}, campaign ${campaignId}`);
    
    return job;
  }

  async addFollowRequestJob(
    userId: string,
    campaignId: string,
    data?: Record<string, any>
  ): Promise<Job<JobData>> {
    return this.addJob('followRequest', userId, campaignId, data);
  }

  async addFollowResponseJob(
    userId: string,
    campaignId: string,
    data?: Record<string, any>
  ): Promise<Job<JobData>> {
    return this.addJob('followResponse', userId, campaignId, data);
  }

  async addSendMessagesJob(
    userId: string,
    campaignId: string,
    data?: Record<string, any>
  ): Promise<Job<JobData>> {
    return this.addJob('sendMessages', userId, campaignId, data);
  }

  async getJob(jobId: string): Promise<Job<JobData> | null> {
    const job = await this.queue.getJob(jobId);
    return job || null;
  }

  async getQueueStats() {
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }

  async getWaitingJobs(): Promise<Job<JobData>[]> {
    return this.queue.getWaiting();
  }

  async getActiveJobs(): Promise<Job<JobData>[]> {
    return this.queue.getActive();
  }

  async getCompletedJobs(): Promise<Job<JobData>[]> {
    return this.queue.getCompleted();
  }

  async getFailedJobs(): Promise<Job<JobData>[]> {
    return this.queue.getFailed();
  }

  getQueue(): Queue<JobData> {
    return this.queue;
  }
} 
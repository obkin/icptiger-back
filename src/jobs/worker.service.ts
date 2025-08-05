import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { QueueService, JobData } from './queue.service';
import { FollowRequestProcessor } from './processors/follow-request.processor';
import { FollowResponseProcessor } from './processors/follow-response.processor';
// import { SendMessagesProcessor } from './processors/send-messages.processor';
// import { PendingJobsProcessor } from './processors/pending-jobs.processor';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private workers: Worker[] = [];

  constructor(
    private queueService: QueueService,
    private configService: ConfigService,
    private followRequestProcessor: FollowRequestProcessor,
    private followResponseProcessor: FollowResponseProcessor,
    // private sendMessagesProcessor: SendMessagesProcessor,
    // private pendingJobsProcessor: PendingJobsProcessor,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing BullMQ workers...');
    
    // Create workers for each job type
    await this.createWorkers();
    
    this.logger.log(`Started ${this.workers.length} BullMQ workers`);
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down BullMQ workers...');
    
    // Close all workers
    await Promise.all(
      this.workers.map(async (worker) => {
        await worker.close();
      })
    );

    this.logger.log('All workers closed');
  }

  private async createWorkers(): Promise<void> {
    const redisConfig = {
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
    };
    const concurrency = 5; // Process up to 5 jobs concurrently per worker

    // Follow Request Worker
    const followRequestWorker = new Worker<JobData>(
      'linkedin-automation',
      async (job) => {
        if (job.data.jobType === 'followRequest') {
          await this.followRequestProcessor.process(job);
        }
      },
      {
        connection: redisConfig,
        concurrency,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    this.setupWorkerEventHandlers(followRequestWorker, 'FollowRequest');
    this.workers.push(followRequestWorker);

    // Follow Response Worker
    const followResponseWorker = new Worker<JobData>(
      'linkedin-automation',
      async (job) => {
        if (job.data.jobType === 'followResponse') {
          await this.followResponseProcessor.process(job);
        }
      },
      {
        connection: redisConfig,
        concurrency,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    this.setupWorkerEventHandlers(followResponseWorker, 'FollowResponse');
    this.workers.push(followResponseWorker);

    // TODO: Add other workers when processors are ready
    /*
    // Follow Response Worker
    const followResponseWorker = new Worker<JobData>(
      'linkedin-automation',
      async (job) => {
        if (job.data.jobType === 'followResponse') {
          await this.followResponseProcessor.process(job);
        }
      },
      {
        connection: redisConfig,
        concurrency,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    this.setupWorkerEventHandlers(followResponseWorker, 'FollowResponse');
    this.workers.push(followResponseWorker);

    // Send Messages Worker
    const sendMessagesWorker = new Worker<JobData>(
      'linkedin-automation',
      async (job) => {
        if (job.data.jobType === 'sendMessages') {
          await this.sendMessagesProcessor.process(job);
        }
      },
      {
        connection: redisConfig,
        concurrency,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    this.setupWorkerEventHandlers(sendMessagesWorker, 'SendMessages');
    this.workers.push(sendMessagesWorker);

    // Pending Jobs Worker
    const pendingJobsWorker = new Worker<JobData>(
      'linkedin-automation',
      async (job) => {
        if (job.data.jobType === 'processPendingJobs') {
          await this.pendingJobsProcessor.process(job);
        }
      },
      {
        connection: redisConfig,
        concurrency: 1, // Only one pending jobs processor at a time
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    );

    this.setupWorkerEventHandlers(pendingJobsWorker, 'PendingJobs');
    this.workers.push(pendingJobsWorker);
    */
  }

  private setupWorkerEventHandlers(worker: Worker, workerName: string): void {
    worker.on('ready', () => {
      this.logger.log(`${workerName} worker is ready`);
    });

    worker.on('active', (job) => {
      this.logger.log(`${workerName} worker started job ${job.id} for user ${job.data.userId}`);
    });

    worker.on('completed', (job, result) => {
      this.logger.log(`${workerName} worker completed job ${job.id} for user ${job.data.userId}`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`${workerName} worker failed job ${job?.id} for user ${job?.data.userId}:`, err);
    });

    worker.on('stalled', (jobId) => {
      this.logger.warn(`${workerName} worker job ${jobId} stalled`);
    });

    worker.on('error', (err) => {
      this.logger.error(`${workerName} worker error:`, err);
    });

    worker.on('closed', () => {
      this.logger.log(`${workerName} worker closed`);
    });
  }

  /**
   * Get worker statistics
   */
  async getWorkerStats(): Promise<{
    totalWorkers: number;
    activeWorkers: number;
    workers: Array<{
      name: string;
      isRunning: boolean;
      isPaused: boolean;
    }>;
  }> {
    const stats = {
      totalWorkers: this.workers.length,
      activeWorkers: 0,
      workers: [] as Array<{
        name: string;
        isRunning: boolean;
        isPaused: boolean;
      }>,
    };

    for (const [index, worker] of this.workers.entries()) {
      const isRunning = worker.isRunning();
      const isPaused = worker.isPaused();
      
      if (isRunning && !isPaused) {
        stats.activeWorkers++;
      }

      stats.workers.push({
        name: `Worker-${index + 1}`,
        isRunning,
        isPaused,
      });
    }

    return stats;
  }

  /**
   * Pause all workers
   */
  async pauseAllWorkers(): Promise<void> {
    this.logger.log('Pausing all workers...');
    
    await Promise.all(
      this.workers.map(worker => worker.pause())
    );

    this.logger.log('All workers paused');
  }

  /**
   * Resume all workers
   */
  async resumeAllWorkers(): Promise<void> {
    this.logger.log('Resuming all workers...');
    
    await Promise.all(
      this.workers.map(worker => worker.resume())
    );

    this.logger.log('All workers resumed');
  }

  /**
   * Get active jobs count across all workers
   */
  async getActiveJobsCount(): Promise<number> {
    // This would typically come from Redis, but for now return 0
    // In a full implementation, you'd query Redis for active jobs
    return 0;
  }
} 
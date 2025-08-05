import { Controller, Post, Get, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { QueueService } from '../../jobs/queue.service';
import { WorkerService } from '../../jobs/worker.service';

export class CreateJobDto {
  userId: string;
  campaignId: string;
  jobType: 'followRequest' | 'followResponse' | 'sendMessages' | 'processPendingJobs';
  data?: Record<string, any>;
}

@Controller('api/jobs')
export class JobsController {
  constructor(
    private queueService: QueueService,
    private workerService: WorkerService
  ) {}

  @Post()
  async createJob(@Body() createJobDto: CreateJobDto) {
    try {
      const { userId, campaignId, jobType, data } = createJobDto;

      const job = await this.queueService.addJob(
        jobType,
        userId,
        campaignId,
        data
      );

      return {
        success: true,
        jobId: job.id,
        message: `${jobType} job created successfully`,
        data: {
          userId,
          campaignId,
          jobType,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create job',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('follow-request')
  async createFollowRequestJob(@Body() body: { userId: string; campaignId: string; importLimit?: number }) {
    try {
      const { userId, campaignId, importLimit = 10 } = body;

      const job = await this.queueService.addFollowRequestJob(
        userId,
        campaignId,
        { importLimit }
      );

      return {
        success: true,
        jobId: job.id,
        message: 'Follow request job created successfully',
        data: {
          userId,
          campaignId,
          importLimit,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create follow request job',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string) {
    try {
      const job = await this.queueService.getJob(jobId);
      
      if (!job) {
        throw new HttpException(
          {
            success: false,
            message: 'Job not found',
          },
          HttpStatus.NOT_FOUND
        );
      }

      return {
        success: true,
        data: {
          id: job.id,
          name: job.name,
          data: job.data,
          opts: job.opts,
          progress: job.progress,
          returnvalue: job.returnvalue,
          stacktrace: job.stacktrace,
          timestamp: job.timestamp,
          finishedOn: job.finishedOn,
          processedOn: job.processedOn,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get job',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats/queue')
  async getQueueStats() {
    try {
      const stats = await this.queueService.getQueueStats();

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get queue stats',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('stats/workers')
  async getWorkerStats() {
    try {
      const stats = this.workerService.getWorkerStats();

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get worker stats',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('waiting')
  async getWaitingJobs() {
    try {
      const jobs = await this.queueService.getWaitingJobs();

      return {
        success: true,
        data: jobs.map(job => ({
          id: job.id,
          name: job.name,
          data: job.data,
          timestamp: job.timestamp,
        })),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get waiting jobs',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('active')
  async getActiveJobs() {
    try {
      const jobs = await this.queueService.getActiveJobs();

      return {
        success: true,
        data: jobs.map(job => ({
          id: job.id,
          name: job.name,
          data: job.data,
          processedOn: job.processedOn,
          progress: job.progress,
        })),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get active jobs',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('completed')
  async getCompletedJobs() {
    try {
      const jobs = await this.queueService.getCompletedJobs();

      return {
        success: true,
        data: jobs.map(job => ({
          id: job.id,
          name: job.name,
          data: job.data,
          finishedOn: job.finishedOn,
          returnvalue: job.returnvalue,
        })),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get completed jobs',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('failed')
  async getFailedJobs() {
    try {
      const jobs = await this.queueService.getFailedJobs();

      return {
        success: true,
        data: jobs.map(job => ({
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
          finishedOn: job.finishedOn,
          stacktrace: job.stacktrace,
        })),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get failed jobs',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 
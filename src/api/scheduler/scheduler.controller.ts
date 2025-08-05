import { Controller, Post, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SchedulerService } from '../../scheduler/scheduler.service';

@Controller('api/scheduler')
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  @Get('status')
  async getStatus() {
    try {
      return {
        success: true,
        data: {
          status: 'running',
          message: 'LinkedIn Automation Scheduler is active',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get scheduler status',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('trigger/follow-requests')
  async triggerFollowRequests() {
    try {
      await this.schedulerService.processFollowRequests();

      return {
        success: true,
        message: 'Follow requests processing triggered successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to trigger follow requests processing',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('trigger/follow-responses')
  async triggerFollowResponses() {
    try {
      await this.schedulerService.processFollowResponses();

      return {
        success: true,
        message: 'Follow responses processing triggered successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to trigger follow responses processing',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('trigger/pending-jobs')
  async triggerPendingJobs() {
    try {
      await this.schedulerService.processPendingJobs();

      return {
        success: true,
        message: 'Pending jobs processing triggered successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to trigger pending jobs processing',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 
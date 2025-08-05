import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LinkedInModule } from '../linkedin/linkedin.module';
import { QueueService } from './queue.service';
import { WorkerService } from './worker.service';
import { FollowRequestProcessor } from './processors/follow-request.processor';
import { FollowResponseProcessor } from './processors/follow-response.processor';

@Module({
  imports: [DatabaseModule, LinkedInModule],
  providers: [
    QueueService,
    WorkerService,
    FollowRequestProcessor,
    FollowResponseProcessor,
  ],
  exports: [QueueService, WorkerService],
})
export class JobsModule {} 
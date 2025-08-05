import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { BrowserModule } from './browser/browser.module';
import { LinkedInModule } from './linkedin/linkedin.module';
import { JobsModule } from './jobs/jobs.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { WebsocketModule } from './websocket/websocket.module';
import { JobsController } from './api/jobs/jobs.controller';
import { SchedulerController } from './api/scheduler/scheduler.controller';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BrowserModule,
    LinkedInModule, 
    JobsModule,
    SchedulerModule,
    WebsocketModule,
  ],
  controllers: [AppController, JobsController, SchedulerController],
  providers: [AppService],
})
export class AppModule {}

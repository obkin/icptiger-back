import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BrowserModule } from '../browser/browser.module';
import { LinkedInSettingsService } from './settings.service';
import { LinkedInAutomationService } from './automation.service';

@Module({
  imports: [DatabaseModule, BrowserModule],
  providers: [LinkedInSettingsService, LinkedInAutomationService],
  exports: [LinkedInSettingsService, LinkedInAutomationService],
})
export class LinkedInModule {} 
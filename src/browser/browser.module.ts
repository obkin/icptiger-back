import { Module } from '@nestjs/common';
import { PuppeteerService } from './puppeteer.service';
import { SessionService } from './session.service';

@Module({
  providers: [PuppeteerService, SessionService],
  exports: [PuppeteerService, SessionService],
})
export class BrowserModule {} 
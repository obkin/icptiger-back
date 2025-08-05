import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Browser, Page } from 'puppeteer';
import { PuppeteerService } from './puppeteer.service';

export interface BrowserSessionInfo {
  browser: Browser;
  page: Page;
  isLoggedIn: boolean;
  createdAt: Date;
  lastActivity: Date;
  userId: string;
  sessionId: string;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private sessions = new Map<string, BrowserSessionInfo>();

  constructor(
    private puppeteerService: PuppeteerService,
    private configService: ConfigService
  ) {}

  async createSession(userId: string): Promise<BrowserSessionInfo> {
    try {
      this.logger.log(`Creating browser session for user ${userId}`);
      
      const browser = await this.puppeteerService.launchBrowser();
      const page = await this.puppeteerService.createPage(browser);
      
      await page.goto('https://www.linkedin.com/login', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      const sessionId = `${userId}_${Date.now()}`;
      const sessionInfo: BrowserSessionInfo = {
        browser,
        page,
        isLoggedIn: false,
        createdAt: new Date(),
        lastActivity: new Date(),
        userId,
        sessionId,
      };

      this.sessions.set(userId, sessionInfo);

      const screenshot = await page.screenshot({
        type: 'png',
        quality: 100,
        clip: { x: 0, y: 0, width: 1280, height: 800 }
      });

      setTimeout(() => {
        this.cleanupSession(userId);
      }, 20 * 60 * 1000);

      this.logger.log(`Browser session created for user ${userId}`);
      return sessionInfo;
    } catch (error) {
      this.logger.error(`Failed to create session for user ${userId}:`, error);
      throw error;
    }
  }

  async getSession(userId: string): Promise<BrowserSessionInfo | null> {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session || null;
  }

  async getOrCreateSession(userId: string): Promise<BrowserSessionInfo> {
    let session = await this.getSession(userId);
    if (!session) {
      session = await this.createSession(userId);
    }
    return session;
  }

  async updateSessionActivity(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  async captureScreenshot(userId: string): Promise<Buffer | null> {
    const session = this.sessions.get(userId);
    if (!session || !session.page) {
      return null;
    }

    try {
      await this.updateSessionActivity(userId);
      const screenshot = await session.page.screenshot({
        type: 'png',
        quality: 100,
      });
      return screenshot as Buffer;
    } catch (error) {
      this.logger.error(`Failed to capture screenshot for user ${userId}:`, error);
      return null;
    }
  }

  async handleMouseEvent(userId: string, event: any): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session || !session.page) return;

    try {
      await this.updateSessionActivity(userId);
      
      switch (event.type) {
        case 'click':
          await session.page.click(`[data-x="${event.x}"][data-y="${event.y}"]`);
          break;
        case 'move':
          await session.page.mouse.move(event.x, event.y);
          break;
      }
    } catch (error) {
      this.logger.error(`Mouse event error for user ${userId}:`, error);
    }
  }

  async handleKeyboardEvent(userId: string, event: any): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session || !session.page) return;

    try {
      await this.updateSessionActivity(userId);
      
      switch (event.type) {
        case 'keypress':
          await session.page.keyboard.press(event.key);
          break;
        case 'type':
          await session.page.keyboard.type(event.text);
          break;
      }
    } catch (error) {
      this.logger.error(`Keyboard event error for user ${userId}:`, error);
    }
  }

  async closeSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session) {
      try {
        if (session.browser) {
          await session.browser.close();
        }
        this.sessions.delete(userId);
        this.logger.log(`Session closed for user ${userId}`);
      } catch (error) {
        this.logger.error(`Error closing session for user ${userId}:`, error);
      }
    }
  }

  private async cleanupSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;

    const now = new Date();
    const timeoutMs = 20 * 60 * 1000;
    const isExpired = now.getTime() - session.lastActivity.getTime() > timeoutMs;

    if (isExpired) {
      await this.closeSession(userId);
      this.logger.log(`Session expired and cleaned up for user ${userId}`);
    } else {
      setTimeout(() => {
        this.cleanupSession(userId);
      }, timeoutMs);
    }
  }

  async cleanupAllSessions(): Promise<void> {
    const userIds = Array.from(this.sessions.keys());
    for (const userId of userIds) {
      await this.closeSession(userId);
    }
    this.logger.log('All sessions cleaned up');
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
} 
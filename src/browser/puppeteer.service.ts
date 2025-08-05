import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

@Injectable()
export class PuppeteerService implements OnModuleInit {
  private readonly logger = new Logger(PuppeteerService.name);
  private browser: Browser | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.logger.log('Puppeteer service initialized');
  }

  async launchBrowser(): Promise<Browser> {
    try {
      const config = this.configService.get('browser');
      
      if (!config) {
        throw new Error('Browser configuration not found');
      }

      const browserOptions = {
        headless: config.headless ?? true,
        executablePath: config.executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
        defaultViewport: {
          width: config.defaultViewport?.width ?? 1920,
          height: config.defaultViewport?.height ?? 1080,
        },
      };

      this.browser = await puppeteer.launch(browserOptions);
      this.logger.log('Browser launched successfully');
      
      return this.browser;
    } catch (error) {
      this.logger.error('Failed to launch browser:', error);
      throw error;
    }
  }

  async createPage(browser?: Browser): Promise<Page> {
    try {
      const targetBrowser = browser || this.browser;
      
      if (!targetBrowser) {
        throw new Error('No browser instance available');
      }

      const page = await targetBrowser.newPage();
      
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      return page;
    } catch (error) {
      this.logger.error('Failed to create page:', error);
      throw error;
    }
  }

  async closeBrowser(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.logger.log('Browser closed successfully');
      }
    } catch (error) {
      this.logger.error('Failed to close browser:', error);
    }
  }

  getBrowser(): Browser | null {
    return this.browser;
  }
} 
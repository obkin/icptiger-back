import { Browser, Page, CDPSession } from 'puppeteer';

export interface BrowserSessionInfo {
  browser: Browser;
  page: Page;
  clientSession: CDPSession;
  timeoutHandle: NodeJS.Timeout;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
}

export interface MouseEvent {
  type: 'click' | 'move' | 'mousedown' | 'mouseup';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
}

export interface KeyboardEvent {
  type: 'keydown' | 'keyup' | 'keypress';
  key: string;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
}

export interface SocketEvents {
  // Outgoing events (server -> client)
  screencast: (data: string) => void;
  readyForLogin: (data: { message: string }) => void;
  loginSuccess: (data: { message: string; skipBrowserLaunch?: boolean }) => void;
  loginError: (error: string) => void;
  linkedinSessionExpired: (data: { message: string }) => void;
  automationStatus: (status: { inUse: boolean }) => void;
  sessionTimeout: (data: { message: string }) => void;
  error: (error: string) => void;

  // Incoming events (client -> server)
  mouse: (event: MouseEvent) => void;
  keyboard: (event: KeyboardEvent) => void;
  disconnect: () => void;
}

export interface ConnectionQuery {
  user_id: string;
}

export interface AutomationStatus {
  inUse: boolean;
  userId?: string;
  sessionId?: string;
  startedAt?: Date;
} 
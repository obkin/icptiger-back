export interface AppConfig {
  environment: string;
  port: number;
  socketPort: number;
  supabase: {
    url: string;
    key: string;
  };
  redis: {
    url: string;
    host: string;
    port: number;
  };
  browser: {
    executablePath?: string;
    headless: boolean;
    defaultViewport: {
      width: number;
      height: number;
    };
  };
}

export default (): AppConfig => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_KEY');
  }

  return {
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    socketPort: parseInt(process.env.SOCKET_PORT || '3008', 10),
    supabase: {
      url: supabaseUrl,
      key: supabaseKey,
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
    browser: {
      executablePath: process.env.CHROME_EXECUTABLE_PATH,
      headless: process.env.HEADLESS !== 'false',
      defaultViewport: {
        width: parseInt(process.env.VIEWPORT_WIDTH || '1920', 10),
        height: parseInt(process.env.VIEWPORT_HEIGHT || '1080', 10),
      },
    },
  };
}; 
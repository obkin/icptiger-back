# 🚀 ICP Tiger Automation (NestJS)

LinkedIn automation backend built with NestJS, BullMQ, and Puppeteer.

## 🏗️ Architecture

- **NestJS Framework** - Modern Node.js backend framework
- **BullMQ + Redis** - Robust job queue system
- **Puppeteer** - Browser automation
- **Supabase** - Database and authentication
- **Socket.IO** - Real-time communication
- **TypeScript** - Type safety

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Redis server
- Chrome/Chromium browser

### Installation

```bash
npm install
```

### Environment Variables

Create `.env` file:

```env
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Server
PORT=3000
SOCKET_PORT=3008

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Browser
CHROME_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
HEADLESS=true
VIEWPORT_WIDTH=1920
VIEWPORT_HEIGHT=1080
```

### Start Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## 📋 API Endpoints

### Jobs Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs/follow-request` | Create follow request job |
| GET | `/api/jobs/stats/queue` | Queue statistics |
| GET | `/api/jobs/stats/workers` | Worker statistics |
| GET | `/api/jobs/waiting` | Waiting jobs |
| GET | `/api/jobs/active` | Active jobs |
| GET | `/api/jobs/completed` | Completed jobs |
| GET | `/api/jobs/failed` | Failed jobs |
| GET | `/api/jobs/:id` | Get job by ID |

### Scheduler Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scheduler/status` | Scheduler status |
| POST | `/api/scheduler/trigger/follow-requests` | Trigger follow requests |
| POST | `/api/scheduler/trigger/follow-responses` | Trigger follow responses |
| POST | `/api/scheduler/trigger/pending-jobs` | Trigger pending jobs |

### WebSocket Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `connected` | Server → Client | Connection confirmed |
| `launchLinkedInLogin` | Client → Server | Request login session |
| `readyForLogin` | Server → Client | Login page ready |
| `mouseEvent` | Client → Server | Mouse interaction |
| `keyboardEvent` | Client → Server | Keyboard interaction |
| `getScreenshot` | Client → Server | Request screenshot |
| `screenshot` | Server → Client | Screenshot data |

## 🔄 Automation Flow

### Automated Schedule
- **Every 15 minutes** - Process follow requests
- **Every 13 minutes** - Send follow-up messages  
- **Every hour** - Process pending jobs
- **Daily at 2 AM** - Cleanup old jobs

### Campaign Types
- **Search** - LinkedIn search automation
- **Reactions** - Post reaction automation
- **Comments** - Comment automation
- **Events** - Event participant automation
- **CSV** - Custom list automation

### Daily Limits
- **Connections**: 50 per day
- **Messages**: 20 per day
- **Profile Views**: 100 per day

## 🛠️ Development

### Project Structure
```
src/
├── api/                 # REST controllers
├── browser/             # Puppeteer services
├── common/              # Shared types/utilities
├── config/              # Configuration
├── database/            # Supabase integration
├── jobs/                # BullMQ processors
├── linkedin/            # LinkedIn automation
├── scheduler/           # Cron jobs
└── websocket/           # Socket.IO gateway
```

### Available Scripts
```bash
npm run start:dev        # Development mode
npm run build            # Build for production  
npm run start:prod       # Production mode
npm run lint             # Run linter
npm run test             # Run tests
```

## 📊 Monitoring

Monitor system health via API endpoints:
- Queue statistics: `GET /api/jobs/stats/queue`
- Worker statistics: `GET /api/jobs/stats/workers`
- Scheduler status: `GET /api/scheduler/status`

## 🔧 Configuration

All configuration is managed through environment variables and the config module. See `src/config/configuration.ts` for available options.

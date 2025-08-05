import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
})
export class SimpleWebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SimpleWebsocketGateway.name);
  private userSockets = new Map<string, Socket>();

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket, ...args: any[]) {
    const query = client.handshake.query as any;
    const userId = query.user_id as string;

    if (!userId) {
      this.logger.warn('Connection attempt without user_id');
      client.disconnect();
      return;
    }

    this.logger.log(`User ${userId} connected with socket ${client.id}`);
    this.userSockets.set(userId, client);

    client.join(`user_${userId}`);
    client.emit('connected', {
      message: 'Successfully connected to automation server',
      userId,
    });
  }

  handleDisconnect(client: Socket) {
    const query = client.handshake.query as any;
    const userId = query.user_id as string;

    if (userId) {
      this.userSockets.delete(userId);
      this.logger.log(`User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('launchLinkedInLogin')
  async handleLaunchLinkedInLogin(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const query = client.handshake.query as any;
    const userId = query.user_id as string;

    if (!userId) {
      client.emit('error', 'User ID not provided');
      return;
    }

    this.logger.log(`[${userId}] LinkedIn login requested - responding with mock success`);

    setTimeout(() => {
      client.emit('readyForLogin', {
        message: 'LinkedIn login page loaded, ready for user interaction',
      });
    }, 1000);
  }

  @SubscribeMessage('mouseEvent')
  async handleMouseEvent(
    @MessageBody() event: any,
    @ConnectedSocket() client: Socket,
  ) {
    const query = client.handshake.query as any;
    const userId = query.user_id as string;

    if (!userId) return;

    this.logger.log(`[${userId}] Mouse event: ${event.type}`);
  }

  @SubscribeMessage('keyboardEvent')
  async handleKeyboardEvent(
    @MessageBody() event: any,
    @ConnectedSocket() client: Socket,
  ) {
    const query = client.handshake.query as any;
    const userId = query.user_id as string;

    if (!userId) return;

    this.logger.log(`[${userId}] Keyboard event: ${event.type}`);
  }

  @SubscribeMessage('getScreenshot')
  async handleGetScreenshot(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const query = client.handshake.query as any;
    const userId = query.user_id as string;

    if (!userId) return;

    this.logger.log(`[${userId}] Screenshot requested`);
    
    client.emit('screenshot', {
      screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });
  }

  @SubscribeMessage('closeSession')
  async handleCloseSession(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const query = client.handshake.query as any;
    const userId = query.user_id as string;

    if (!userId) return;

    this.logger.log(`[${userId}] Session close requested`);
    client.emit('sessionClosed', { message: 'Session closed successfully' });
  }

  @SubscribeMessage('getSessionStatus')
  async handleGetSessionStatus(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const query = client.handshake.query as any;
    const userId = query.user_id as string;

    if (!userId) return;

    client.emit('sessionStatus', {
      hasSession: false,
      isLoggedIn: false,
      url: null,
    });
  }

  async sendToUser(userId: string, event: string, data: any): Promise<void> {
    this.server.to(`user_${userId}`).emit(event, data);
  }

  async broadcast(event: string, data: any): Promise<void> {
    this.server.emit(event, data);
  }

  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }
} 
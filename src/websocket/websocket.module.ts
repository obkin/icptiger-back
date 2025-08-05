import { Module } from '@nestjs/common';
import { SimpleWebsocketGateway } from './simple-websocket.gateway';

@Module({
  providers: [SimpleWebsocketGateway],
  exports: [SimpleWebsocketGateway],
})
export class WebsocketModule {} 
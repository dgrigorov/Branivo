import { Module } from '@nestjs/common';
import { AnonymousSessionsController } from './anonymous-sessions.controller';
import { AnonymousSessionsService } from './anonymous-sessions.service';

@Module({
  controllers: [AnonymousSessionsController],
  providers: [AnonymousSessionsService],
  exports: [AnonymousSessionsService],
})
export class SessionsModule {}

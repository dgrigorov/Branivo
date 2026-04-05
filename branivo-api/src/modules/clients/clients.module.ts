import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { SessionsModule } from '../sessions/sessions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EndClient } from './entities/end-client.entity';
import { EndClientRepository } from './repositories/end-client.repository';
import { ClientAuthService } from './client-auth.service';
import { ClientAuthController } from './client-auth.controller';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { SmsService } from './sms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EndClient]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    TenantContextModule,
    SessionsModule,
    NotificationsModule,
  ],
  controllers: [ClientAuthController, ClientsController],
  providers: [
    ClientAuthService,
    ClientsService,
    EndClientRepository,
    SmsService,
  ],
  exports: [ClientAuthService, EndClientRepository],
})
export class ClientsModule {}

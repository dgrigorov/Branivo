import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { SessionsModule } from '../sessions/sessions.module';
import { EndClient } from './entities/end-client.entity';
import { EndClientRepository } from './repositories/end-client.repository';
import { ClientAuthService } from './client-auth.service';
import { ClientAuthController } from './client-auth.controller';
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
  ],
  controllers: [ClientAuthController],
  providers: [ClientAuthService, EndClientRepository, SmsService],
  exports: [ClientAuthService],
})
export class ClientsModule {}

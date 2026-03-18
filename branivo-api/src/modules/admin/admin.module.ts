import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { TenantInvitation } from './entities/tenant-invitation.entity';
import { TenantInvitationsRepository } from './repositories/tenant-invitations.repository';
import { AdminTenantsService } from './admin-tenants.service';
import { AdminTenantsController } from './admin-tenants.controller';
import { WebhooksController } from './webhooks.controller';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EmailService } from '../../common/email/email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantInvitation]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('ONBOARDING_JWT_SECRET'),
        signOptions: { expiresIn: '48h' },
      }),
    }),
    TenantsModule,
    UsersModule,
  ],
  controllers: [AdminTenantsController, WebhooksController],
  providers: [
    AdminTenantsService,
    TenantInvitationsRepository,
    CryptoService,
    EmailService,
  ],
  exports: [AdminTenantsService],
})
export class AdminModule {}

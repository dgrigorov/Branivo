import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { TenantsModule } from '../tenants/tenants.module';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EmailModule } from '../../infrastructure/email/email.module';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    TypeOrmModule.forFeature([PasswordResetToken]),
    UsersModule,
    TenantsModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    CryptoService,
    PasswordResetTokensRepository,
  ],
  exports: [AuthService, JwtStrategy, CryptoService],
})
export class AuthModule {}

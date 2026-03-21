import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CommissionMatrix } from './entities/commission-matrix.entity';
import { CommissionsRepository } from './commissions.repository';
import { CommissionsService } from './commissions.service';
import { CommissionsController } from './commissions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CommissionMatrix]), ConfigModule],
  controllers: [CommissionsController],
  providers: [CommissionsService, CommissionsRepository],
  exports: [CommissionsService],
})
export class CommissionsModule {}

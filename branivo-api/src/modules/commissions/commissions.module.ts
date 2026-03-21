import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CommissionMatrix } from './entities/commission-matrix.entity';
import { PendingCommissionEvent } from './entities/pending-commission-event.entity';
import { CommissionsRepository } from './commissions.repository';
import { CommissionsService } from './commissions.service';
import {
  BrokerCommissionsController,
  CommissionsController,
} from './commissions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommissionMatrix, PendingCommissionEvent]),
    ConfigModule,
  ],
  controllers: [CommissionsController, BrokerCommissionsController],
  providers: [CommissionsService, CommissionsRepository],
  exports: [CommissionsService],
})
export class CommissionsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsurersController } from './insurers.controller';
import { FscInsurerEntity } from './entities/fsc-insurer.entity';
import { InsurersService } from './insurers.service';

@Module({
  imports: [TypeOrmModule.forFeature([FscInsurerEntity])],
  controllers: [InsurersController],
  providers: [InsurersService],
  exports: [InsurersService],
})
export class InsurersModule {}

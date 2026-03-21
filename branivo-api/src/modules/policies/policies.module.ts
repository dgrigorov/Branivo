import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { QueueModule } from '../../infrastructure/queues/queue.module';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { PoliciesRepository } from './policies.repository';
import { PolicyEventsRepository } from './policy-events.repository';
import { PdfGenerationProcessor } from './pdf-generation.processor';
import { Policy } from './entities/policy.entity';
import { PolicyEvent } from './entities/policy-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Policy, PolicyEvent]),
    TenantContextModule,
    QueueModule,
  ],
  controllers: [PoliciesController],
  providers: [
    PoliciesService,
    PoliciesRepository,
    PolicyEventsRepository,
    PdfGenerationProcessor,
  ],
  exports: [PoliciesService, PoliciesRepository, PolicyEventsRepository],
})
export class PoliciesModule {}

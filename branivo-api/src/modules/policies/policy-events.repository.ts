import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PolicyEvent, PolicyEventType } from './entities/policy-event.entity';

@Injectable()
export class PolicyEventsRepository {
  constructor(
    @InjectRepository(PolicyEvent)
    private readonly eventRepo: Repository<PolicyEvent>,
  ) {}

  // READ-only lookup — без tenantId scope (webhook context)
  async findByStripeEventId(
    stripeEventId: string,
  ): Promise<PolicyEvent | null> {
    return this.eventRepo.findOne({
      where: { stripeEventId },
    });
  }

  // САМО INSERT — без update/delete методи (immutable record)
  async createEvent(data: {
    tenantId: string;
    policyId: string;
    eventType: PolicyEventType;
    payload: Record<string, unknown>;
    stripeEventId?: string;
  }): Promise<PolicyEvent> {
    const event = this.eventRepo.create({
      ...data,
      createdBy: 'system',
    });
    return this.eventRepo.save(event);
  }
}

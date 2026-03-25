import { Injectable, Logger } from '@nestjs/common';
import * as archiver from 'archiver';
import { EndClientRepository } from '../clients/repositories/end-client.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { PoliciesRepository } from '../policies/policies.repository';
import { PaymentsRepository } from '../payments/payments.repository';
import { EndClient } from '../clients/entities/end-client.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Policy } from '../policies/entities/policy.entity';
import { Payment } from '../payments/entities/payment.entity';

@Injectable()
export class DataAggregatorService {
  private readonly logger = new Logger(DataAggregatorService.name);

  constructor(
    private readonly endClientRepo: EndClientRepository,
    private readonly vehiclesRepo: VehiclesRepository,
    private readonly policiesRepo: PoliciesRepository,
    private readonly paymentsRepo: PaymentsRepository,
  ) {}

  async buildExportZip(customerId: string, tenantId: string): Promise<Buffer> {
    const [profile, vehicles, policies, payments]: [
      EndClient | null,
      Vehicle[],
      Policy[],
      Payment[],
    ] = await Promise.all([
      this.endClientRepo.findById(customerId),
      this.vehiclesRepo.findByOwnerId(customerId, tenantId),
      this.policiesRepo.findByEndClientId(customerId, tenantId),
      this.paymentsRepo.findByEndClientId(customerId, tenantId),
    ]);

    this.logger.log(
      `Building export ZIP for customer ${customerId}: ` +
        `${vehicles.length} vehicles, ${policies.length} policies, ${payments.length} payments`,
    );

    return new Promise<Buffer>((resolve, reject) => {
      const archive = archiver.create('zip', { zlib: { level: 6 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      archive.append(JSON.stringify(this.sanitizeProfile(profile), null, 2), {
        name: 'profile.json',
      });
      archive.append(
        JSON.stringify(
          vehicles.map((v) => this.sanitizeVehicle(v)),
          null,
          2,
        ),
        { name: 'vehicles.json' },
      );
      archive.append(
        JSON.stringify(
          policies.map((p) => this.sanitizePolicy(p)),
          null,
          2,
        ),
        { name: 'policies.json' },
      );
      archive.append(
        JSON.stringify(
          payments.map((p) => this.sanitizePayment(p)),
          null,
          2,
        ),
        { name: 'payments.json' },
      );
      // consent module not yet implemented — placeholder for GDPR completeness
      archive.append(JSON.stringify([], null, 2), { name: 'consents.json' });

      void archive.finalize();
    });
  }

  private sanitizeProfile(
    client: EndClient | null,
  ): Omit<EndClient, 'pushToken'> | null {
    if (!client) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pushToken, ...safe } = client;
    return safe;
  }

  private sanitizeVehicle(
    vehicle: Vehicle,
  ): Pick<
    Vehicle,
    | 'id'
    | 'vin'
    | 'licensePlate'
    | 'make'
    | 'model'
    | 'year'
    | 'color'
    | 'createdAt'
    | 'updatedAt'
  > {
    const {
      id,
      vin,
      licensePlate,
      make,
      model,
      year,
      color,
      createdAt,
      updatedAt,
    } = vehicle;
    return {
      id,
      vin,
      licensePlate,
      make,
      model,
      year,
      color,
      createdAt,
      updatedAt,
    };
  }

  private sanitizePolicy(
    policy: Policy,
  ): Omit<
    Policy,
    'stripePaymentIntentId' | 'commissionAmount' | 'commissionPct' | 'metadata'
  > {
    // Destructure-to-omit: excluded fields intentionally ignored (GDPR — never export Stripe/commission data)
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      stripePaymentIntentId,
      commissionAmount,
      commissionPct,
      metadata,
      ...safe
    } = policy;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return safe;
  }

  private sanitizePayment(
    payment: Payment,
  ): Omit<
    Payment,
    'stripePaymentIntentId' | 'stripeClientSecret' | 'idempotencyKey'
  > {
    // Destructure-to-omit: excluded fields intentionally ignored (GDPR — never export Stripe credentials)
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      stripePaymentIntentId,
      stripeClientSecret,
      idempotencyKey,
      ...safe
    } = payment;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return safe;
  }
}

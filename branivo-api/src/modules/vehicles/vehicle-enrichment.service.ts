import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { KatApiAdapter } from './adapters/kat-api.adapter';
import { GarantsionenFondAdapter } from './adapters/garantsionen-fond.adapter';
import { Policy, PolicyStatus } from '../policies/entities/policy.entity';
import {
  EnrichVehicleQueryDto,
  EnrichField,
} from './dto/enrich-vehicle-query.dto';

type EnrichFieldResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'timeout'; data: null }
  | { status: 'error'; data: null };

interface ExistingPolicyData {
  policy_number: string;
  insurer: string;
}

interface GfData {
  policy_found: boolean;
  insurer?: string;
  valid_until?: string;
}

interface KatData {
  status: string;
}

interface NhtsaData {
  make?: string;
  model?: string;
  year?: number;
}

export interface EnrichmentResponse {
  existing_policy?: EnrichFieldResult<ExistingPolicyData>;
  kat?: EnrichFieldResult<KatData>;
  gf?: EnrichFieldResult<GfData>;
  nhtsa?: EnrichFieldResult<NhtsaData>;
}

const DB_TIMEOUT_MS = 500;
const KAT_TIMEOUT_MS = 4000;
const GF_TIMEOUT_MS = 5000;
const NHTSA_TIMEOUT_MS = 3000;

@Injectable()
export class VehicleEnrichmentService {
  private readonly logger = new Logger(VehicleEnrichmentService.name);

  constructor(
    @InjectRepository(Policy)
    private readonly policyRepo: Repository<Policy>,
    private readonly tenantContext: TenantContext,
    private readonly katAdapter: KatApiAdapter,
    private readonly gfAdapter: GarantsionenFondAdapter,
  ) {}

  async enrich(dto: EnrichVehicleQueryDto): Promise<EnrichmentResponse> {
    const response: EnrichmentResponse = {};

    // Step 1: existing active policy check (~50ms, blocking, tenant-scoped)
    response.existing_policy = await this.checkExistingPolicy(
      dto.reg_number,
      dto.vin,
    );

    // If existing active policy found (data is non-null) → hard block, skip enrichment
    if (
      response.existing_policy.status === 'ok' &&
      response.existing_policy.data !== null
    ) {
      return response;
    }

    // Step 2: Parallel enrichment based on requested fields
    const fields = new Set<EnrichField>(dto.fields);

    const promises: Array<Promise<void>> = [];

    if (fields.has('kat')) {
      promises.push(
        this.runKat(dto.reg_number, dto.vin).then((r) => {
          response.kat = r;
        }),
      );
    }

    if (fields.has('gf')) {
      promises.push(
        this.runGf(dto.reg_number, dto.vin).then((r) => {
          response.gf = r;
        }),
      );
    }

    if (fields.has('nhtsa')) {
      promises.push(
        this.runNhtsa(dto.vin).then((r) => {
          response.nhtsa = r;
        }),
      );
    }

    await Promise.allSettled(promises);

    return response;
  }

  private async checkExistingPolicy(
    regNumber: string | undefined,
    vin: string | undefined,
  ): Promise<EnrichFieldResult<ExistingPolicyData>> {
    const tenantId = this.tenantContext.getTenantId();

    try {
      const result = await Promise.race([
        this.findActivePolicy(tenantId, regNumber, vin),
        this.timeout(DB_TIMEOUT_MS),
      ]);

      if (!result) {
        // No existing policy — data is null, status is ok
        return {
          status: 'ok',
          data: null as unknown as ExistingPolicyData,
        } as {
          status: 'ok';
          data: ExistingPolicyData;
        };
      }

      return {
        status: 'ok',
        data: {
          policy_number: result.policyNumber,
          insurer: result.insurerId,
        },
      };
    } catch {
      this.logger.warn(
        'Existing policy DB check timed out or failed — continuing',
      );
      return { status: 'timeout', data: null };
    }
  }

  private async findActivePolicy(
    tenantId: string,
    regNumber: string | undefined,
    vin: string | undefined,
  ): Promise<Policy | null> {
    if (!regNumber && !vin) return null;

    const qb = this.policyRepo
      .createQueryBuilder('p')
      .innerJoin('vehicles', 'v', 'v.id = p.vehicle_id')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: PolicyStatus.ACTIVE });

    if (regNumber) {
      qb.andWhere('v.license_plate = :regNumber', { regNumber });
    } else if (vin) {
      qb.andWhere('v.vin = :vin', { vin });
    }

    return qb.getOne();
  }

  private async runKat(
    regNumber: string | undefined,
    vin: string | undefined,
  ): Promise<EnrichFieldResult<KatData>> {
    if (!regNumber && !vin) {
      return { status: 'error', data: null };
    }
    try {
      const result = await Promise.race([
        this.katAdapter.validateVin(vin ?? regNumber ?? ''),
        this.timeout(KAT_TIMEOUT_MS),
      ]);
      const katResult = result as { status: string } | null;
      if (!katResult) return { status: 'timeout', data: null };
      return { status: 'ok', data: { status: katResult.status ?? 'ok' } };
    } catch {
      return { status: 'timeout', data: null };
    }
  }

  private async runGf(
    regNumber: string | undefined,
    vin: string | undefined,
  ): Promise<EnrichFieldResult<GfData>> {
    if (!regNumber && !vin) {
      return { status: 'error', data: null };
    }
    try {
      const result = await Promise.race([
        this.gfAdapter.checkVehicle(vin ?? '', regNumber ?? ''),
        this.timeout(GF_TIMEOUT_MS),
      ]);
      const gfResult = result as {
        flagged: boolean;
        reason?: string;
      } | null;
      if (!gfResult) return { status: 'timeout', data: null };
      return {
        status: 'ok',
        data: {
          policy_found: gfResult.flagged,
          insurer: gfResult.reason,
        },
      };
    } catch {
      return { status: 'timeout', data: null };
    }
  }

  private async runNhtsa(
    vin: string | undefined,
  ): Promise<EnrichFieldResult<NhtsaData>> {
    if (!vin) {
      return { status: 'error', data: null };
    }
    try {
      // NHTSA VPIC decode — basic implementation, fallback on error
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`;
      const res = await Promise.race([
        fetch(url).then((r) => r.json() as Promise<Record<string, unknown>>),
        this.timeout(NHTSA_TIMEOUT_MS),
      ]);
      if (!res) return { status: 'timeout', data: null };
      const nhtsaRes = res as {
        Results?: Array<{ Variable: string; Value: string }>;
      };
      const results = nhtsaRes.Results ?? [];
      const get = (v: string) =>
        results.find((r) => r.Variable === v)?.Value ?? undefined;
      return {
        status: 'ok',
        data: {
          make: get('Make') || undefined,
          model: get('Model') || undefined,
          year: get('Model Year') ? Number(get('Model Year')) : undefined,
        },
      };
    } catch {
      return { status: 'error', data: null };
    }
  }

  private timeout(ms: number): Promise<null> {
    return new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  }
}

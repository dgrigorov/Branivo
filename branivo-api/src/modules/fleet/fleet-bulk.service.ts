import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { QuotesService } from '../quotes/quotes.service';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import { PaymentsService } from '../payments/payments.service';
import { FleetRepository } from './fleet.repository';
import type {
  BulkQuoteResponseDto,
  VehicleQuoteResultDto,
} from './dto/bulk-quote-response.dto';
import type { BulkPurchaseItemDto } from './dto/bulk-purchase-request.dto';
import type {
  BulkPurchaseFailedItemDto,
  BulkPurchaseResponseDto,
  BulkPurchaseSuccessItemDto,
} from './dto/bulk-purchase-response.dto';

@Injectable()
export class FleetBulkService {
  constructor(
    private readonly fleetRepository: FleetRepository,
    private readonly quotesService: QuotesService,
    private readonly paymentsService: PaymentsService,
    private readonly tenantContext: TenantContext,
  ) {}

  async bulkGetQuotes(vehicleIds: string[]): Promise<BulkQuoteResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    const vehicles = await this.fleetRepository.findManyByIds(
      tenantId,
      vehicleIds,
    );

    const results = await Promise.allSettled(
      vehicles.map(async (fv) => {
        const sessionToken = `fleet-bulk-${fv.id}-${Date.now()}`;
        const response = await this.quotesService.createQuoteRequest({
          sessionToken,
          vehicleData: {
            vin: fv.vin,
            licensePlate: fv.license_plate,
            make: fv.make,
            model: fv.model,
            year: fv.year,
          },
        });

        const successCount = response.offers.filter(
          (o) => o.status === QuoteStatus.SUCCESS,
        ).length;
        const totalCount = response.offers.length;
        const status =
          successCount === totalCount && totalCount > 0
            ? 'success'
            : successCount > 0
              ? 'partial'
              : 'failed';

        return {
          vehicleId: fv.id,
          licensePlate: fv.license_plate,
          make: fv.make,
          model: fv.model,
          sessionToken,
          status,
          offers: response.offers,
        } satisfies VehicleQuoteResultDto;
      }),
    );

    const resultDtos: VehicleQuoteResultDto[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const fv = vehicles[i];

      if (result.status === 'fulfilled') {
        resultDtos.push(result.value);
      } else {
        resultDtos.push({
          vehicleId: fv?.id ?? '',
          licensePlate: fv?.license_plate ?? '',
          make: fv?.make ?? '',
          model: fv?.model ?? '',
          sessionToken: '',
          status: 'failed',
          offers: [],
        });
      }
    }

    return { results: resultDtos };
  }

  async bulkPurchase(
    items: BulkPurchaseItemDto[],
  ): Promise<BulkPurchaseResponseDto> {
    const results = await Promise.allSettled(
      items.map((item) =>
        this.paymentsService.createIntent({ quoteId: item.quoteId }),
      ),
    );

    const succeeded: BulkPurchaseSuccessItemDto[] = [];
    const failed: BulkPurchaseFailedItemDto[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const item = items[i];

      if (result.status === 'fulfilled') {
        succeeded.push({
          vehicleId: item.vehicleId,
          quoteId: item.quoteId,
          clientSecret: result.value.clientSecret,
          paymentId: result.value.paymentId,
        });
      } else {
        const err = result.reason as Error;
        failed.push({
          vehicleId: item.vehicleId,
          quoteId: item.quoteId,
          error: err.message,
        });
      }
    }

    return {
      succeeded,
      failed,
      summary: {
        total: items.length,
        succeeded: succeeded.length,
        failed: failed.length,
      },
    };
  }
}

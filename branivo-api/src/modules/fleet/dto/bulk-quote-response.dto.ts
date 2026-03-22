import { ApiProperty } from '@nestjs/swagger';
import type { QuoteOfferDto } from '../../quotes/dto/quote-offer.dto';

export type BulkVehicleQuoteStatus = 'success' | 'partial' | 'failed';

export class VehicleQuoteResultDto {
  @ApiProperty({ description: 'Fleet vehicle ID', format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ description: 'Vehicle license plate' })
  licensePlate!: string;

  @ApiProperty()
  make!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ description: 'Session token used for this quote batch' })
  sessionToken!: string;

  @ApiProperty({
    enum: ['success', 'partial', 'failed'],
    description:
      'success = all offers fetched, partial = some failed, failed = all failed',
  })
  status!: BulkVehicleQuoteStatus;

  @ApiProperty({ description: 'Quote offers from all insurers' })
  offers!: QuoteOfferDto[];
}

export class BulkQuoteResponseDto {
  @ApiProperty({ type: [VehicleQuoteResultDto] })
  results!: VehicleQuoteResultDto[];
}

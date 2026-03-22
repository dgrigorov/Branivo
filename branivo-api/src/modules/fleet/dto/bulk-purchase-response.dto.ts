import { ApiProperty } from '@nestjs/swagger';

export class BulkPurchaseSuccessItemDto {
  @ApiProperty({ description: 'Fleet vehicle ID', format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ description: 'Quote offer ID', format: 'uuid' })
  quoteId!: string;

  @ApiProperty({ description: 'Stripe client secret for payment confirmation' })
  clientSecret!: string;

  @ApiProperty({ description: 'Stripe PaymentIntent ID' })
  paymentId!: string;
}

export class BulkPurchaseFailedItemDto {
  @ApiProperty({ description: 'Fleet vehicle ID', format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ description: 'Quote offer ID', format: 'uuid' })
  quoteId!: string;

  @ApiProperty({ description: 'Error message explaining why purchase failed' })
  error!: string;
}

export class BulkPurchaseSummaryDto {
  @ApiProperty({ description: 'Total number of items attempted' })
  total!: number;

  @ApiProperty({ description: 'Number of successful purchases' })
  succeeded!: number;

  @ApiProperty({ description: 'Number of failed purchases' })
  failed!: number;
}

export class BulkPurchaseResponseDto {
  @ApiProperty({ type: [BulkPurchaseSuccessItemDto] })
  succeeded!: BulkPurchaseSuccessItemDto[];

  @ApiProperty({ type: [BulkPurchaseFailedItemDto] })
  failed!: BulkPurchaseFailedItemDto[];

  @ApiProperty({ type: BulkPurchaseSummaryDto })
  summary!: BulkPurchaseSummaryDto;
}

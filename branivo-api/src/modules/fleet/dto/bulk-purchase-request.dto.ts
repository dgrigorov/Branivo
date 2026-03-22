import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BulkPurchaseItemDto {
  @ApiProperty({ description: 'Fleet vehicle ID', format: 'uuid' })
  @IsUUID()
  vehicleId!: string;

  @ApiProperty({ description: 'Quote offer ID to purchase', format: 'uuid' })
  @IsUUID()
  quoteId!: string;
}

export class BulkPurchaseRequestDto {
  @ApiProperty({
    type: [BulkPurchaseItemDto],
    description: 'Items to purchase (max 50)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkPurchaseItemDto)
  @ArrayMaxSize(50)
  items!: BulkPurchaseItemDto[];
}

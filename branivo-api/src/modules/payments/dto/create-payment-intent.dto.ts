import {
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryAddressDto } from './delivery-address.dto';

export class CreatePaymentIntentDto {
  @IsUUID()
  @IsNotEmpty()
  quoteId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;
}

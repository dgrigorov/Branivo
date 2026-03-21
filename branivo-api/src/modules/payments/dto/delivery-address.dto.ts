import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DeliveryAddressDto {
  @IsString()
  @IsNotEmpty()
  recipientName!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  postCode!: string;

  @IsString()
  @IsNotEmpty()
  addressLine!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

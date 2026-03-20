import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  @IsNotEmpty()
  quoteId!: string;
}

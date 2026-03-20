export class PaymentIntentResponseDto {
  clientSecret!: string;
  paymentId!: string;
  amount!: number;
  currency!: string;
}

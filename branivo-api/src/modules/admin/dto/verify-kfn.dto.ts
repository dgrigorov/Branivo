import { IsNotEmpty } from 'class-validator';

export class VerifyKfnDto {
  @IsNotEmpty()
  kfn_license!: string;
}

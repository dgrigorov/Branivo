import { IsEnum, IsNumber, Max, Min } from 'class-validator';
import { ProductType } from '../enums/product-type.enum';

export class UpsertCommissionRateDto {
  @IsEnum(ProductType)
  productType!: ProductType;

  @IsNumber()
  @Min(0)
  @Max(1)
  ratePct!: number;
}

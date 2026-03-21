import { ProductType } from '../enums/product-type.enum';

export class CommissionMatrixEntryDto {
  insurerId!: string;
  insurerName!: string;
  productType!: ProductType;
  ratePct!: number;
  updatedAt!: string; // ISO8601
}

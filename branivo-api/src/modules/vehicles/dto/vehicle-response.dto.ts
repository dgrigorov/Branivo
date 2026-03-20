export class VehicleResponseDto {
  id!: string;
  tenantId!: string;
  ownerId!: string;
  vin!: string;
  licensePlate!: string;
  make!: string;
  model!: string;
  year!: number;
  color!: string | null;
  engineVolume!: string | null;
  fuelType!: string | null;
  firstRegistrationDate!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  lastPolicyStatus?: string | null;
}

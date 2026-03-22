export class DriverVehicleResponseDto {
  vehicleId!: string;
  licensePlate!: string;
  make!: string;
  model!: string;
  insurerName!: string | null;
  policyExpiresAt!: Date | null;
  policyStatus!: string | null;
}

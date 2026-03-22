import { ApiProperty } from '@nestjs/swagger';

export type FleetVehicleStatus = 'green' | 'yellow' | 'red';

export class FleetVehicleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  vehicleId!: string;

  @ApiProperty()
  licensePlate!: string;

  @ApiProperty()
  make!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ nullable: true, type: String })
  insurerName!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  policyExpiresAt!: Date | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Active policy UUID (null if no active policy)',
  })
  activePolicyId!: string | null;

  @ApiProperty({ enum: ['green', 'yellow', 'red'] })
  status!: FleetVehicleStatus;
}

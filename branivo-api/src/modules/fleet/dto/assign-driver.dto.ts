import { IsUUID, ValidateIf } from 'class-validator';

export class AssignDriverDto {
  @ValidateIf((o: AssignDriverDto) => o.driverUserId !== null)
  @IsUUID()
  driverUserId!: string | null;
}

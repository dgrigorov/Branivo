import { IsIn, IsString } from 'class-validator';

export class ChangeTierDto {
  @IsString()
  @IsIn(['starter', 'professional', 'enterprise'])
  newPlan!: string;
}

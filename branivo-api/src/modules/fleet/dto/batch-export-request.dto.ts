import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchExportRequestDto {
  @ApiProperty({
    type: [String],
    description: 'Policy UUIDs to include in batch export (max 50)',
    maxItems: 50,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  policyIds!: string[];
}

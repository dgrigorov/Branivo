import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkQuoteRequestDto {
  @ApiProperty({
    type: [String],
    description: 'Fleet vehicle IDs to get quotes for (max 50)',
    example: ['00000000-0000-4000-8000-000000000001'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  vehicleIds!: string[];
}

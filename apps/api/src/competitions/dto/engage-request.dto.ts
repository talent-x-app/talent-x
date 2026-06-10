import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Corps de `POST /competitions/{id}/entries` — schéma `EngageRequest` (ADR-24). */
export class EngageRequestDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  athleteIds!: string[];

  @ApiPropertyOptional({ description: "L'épreuve, libre au MVP (non reliée aux clés ADR-20)." })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventLabel?: string;
}

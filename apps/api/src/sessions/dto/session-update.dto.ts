import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ExercisesDocDto } from './exercises.dto';
import { SessionBriefDto } from './session-brief.dto';
import { SessionStatus } from './session-create.dto';

/** Corps de `PUT /sessions/{id}` — schéma `SessionUpdate` (sémantique PATCH). */
export class SessionUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Date prévue (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @ApiPropertyOptional({ type: ExercisesDocDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExercisesDocDto)
  exercises?: ExercisesDocDto;

  @ApiPropertyOptional({ type: SessionBriefDto, description: 'Couche éditoriale (ADR-28).' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionBriefDto)
  brief?: SessionBriefDto;
}

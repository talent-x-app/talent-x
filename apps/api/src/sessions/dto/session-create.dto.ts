import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

/** Statut d'une séance — schéma `SessionStatus`. */
export enum SessionStatus {
  Draft = 'draft',
  Published = 'published',
  Archived = 'archived',
  /** Modèle réutilisable (bibliothèque C-10, ADR-29) : non daté, **non assignable**. */
  Template = 'template',
}

/** Corps de `POST /sessions` — schéma `SessionCreate`. */
export class SessionCreateDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Date prévue (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ enum: SessionStatus, description: 'Défaut : draft.' })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @ApiProperty({ type: ExercisesDocDto })
  @ValidateNested()
  @Type(() => ExercisesDocDto)
  exercises!: ExercisesDocDto;

  @ApiPropertyOptional({ type: SessionBriefDto, description: 'Couche éditoriale (ADR-28).' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionBriefDto)
  brief?: SessionBriefDto;
}

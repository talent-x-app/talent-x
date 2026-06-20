import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { SkipReason } from './assignment-update.dto';

/**
 * Présence déclarée (RSVP) — schéma `AttendanceStatus` (ADR-43 §1). Intention déclarée *avant*
 * la séance, **orthogonale** au cycle d'exécution `AssignmentStatus` (ADR-31). `null` (sans
 * réponse) n'est pas une valeur posable : on ne peut que déclarer l'un des trois états.
 */
export enum AttendanceStatus {
  Going = 'going',
  NotGoing = 'not_going',
  Maybe = 'maybe',
}

/**
 * Corps de `PUT /assignments/{id}/attendance` — schéma `AttendanceRequest` (ADR-43 §1).
 * Invariant (vérifié au service) : `reason` requis **ssi** `attendance='not_going'` (422 sinon) ;
 * ignoré pour `going`/`maybe`.
 */
export class AttendanceRequestDto {
  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  attendance!: AttendanceStatus;

  @ApiPropertyOptional({ enum: SkipReason, description: "Requis ssi attendance='not_going'." })
  @IsOptional()
  @IsEnum(SkipReason)
  reason?: SkipReason;
}

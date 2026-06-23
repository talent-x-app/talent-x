import { ApiProperty } from '@nestjs/swagger';
import { GroupTeammateDto } from '../../groups/dto/group-teammate.dto';

/**
 * Agrégat de kudos de participation sur une affectation — schéma `KudosSummary` (ADR-48/ADR-49,
 * Palier 2). `givers` = auteurs minimisés (`GroupTeammate`, ADR-37) **plafonnés**
 * (`KUDOS_GIVERS_CAP`, défaut 8). `mine` = l'appelant a posé un kudos (sa propre donnée). Porte
 * sur la **participation**, jamais sur la performance (ADR-08/21).
 */
export class KudosSummaryDto {
  @ApiProperty({ minimum: 0 })
  count!: number;

  @ApiProperty({
    type: [GroupTeammateDto],
    description:
      'Auteurs des kudos (identité minimisée), plafonnés ; peut être plus court que `count`.',
  })
  givers!: GroupTeammateDto[];

  @ApiProperty({ description: "Vrai si l'appelant a posé un kudos." })
  mine!: boolean;
}

/**
 * Présence confirmée d'un coéquipier sur une séance de groupe partagée — schéma
 * `TeammateAttendance` (ADR-43 §5, AIPD TX-DPIA-007 §5.6). Identité minimisée + kudos agrégés.
 * `assignmentId` = cible des verbes kudos. Aucune donnée de performance.
 */
export class TeammateAttendanceDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Affectation du coéquipier — cible des verbes kudos.',
  })
  assignmentId!: string;

  @ApiProperty({ type: GroupTeammateDto })
  teammate!: GroupTeammateDto;

  @ApiProperty({ type: KudosSummaryDto })
  kudos!: KudosSummaryDto;
}

/** Liste (bornée) des coéquipiers présents — schéma `TeammateAttendanceList`. */
export class TeammateAttendanceListDto {
  @ApiProperty({ type: [TeammateAttendanceDto] })
  data!: TeammateAttendanceDto[];
}

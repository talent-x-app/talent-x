import { ApiProperty } from '@nestjs/swagger';

/**
 * Métadonnées de pagination — schéma `PageMeta` du contrat OpenAPI.
 * Toutes les listes renvoient l'enveloppe `{ data, meta }` (cf. Paginated).
 */
export class PageMetaDto {
  @ApiProperty({ example: 0 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: false })
  hasNext!: boolean;
}

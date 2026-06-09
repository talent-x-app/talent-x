import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Paramètres de pagination communs (contrat : `PageParam`/`LimitParam`/`SortParam`).
 * `@Type(() => Number)` : les query strings sont converties en entiers par le
 * ValidationPipe global (`transform: true`).
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: "Champ de tri, préfixé de '-' pour l'ordre décroissant." })
  @IsOptional()
  @IsString()
  sort?: string;

  /** Décalage SQL dérivé de page/limit. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Paramètres de pagination communs — params `PageParam`, `LimitParam`, `SortParam`
 * du contrat OpenAPI. À étendre par les listes qui ajoutent des filtres.
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

  @ApiPropertyOptional({
    description: "Champ de tri, préfixé de '-' pour l'ordre décroissant (ex. -createdAt).",
  })
  @IsOptional()
  @IsString()
  sort?: string;
}

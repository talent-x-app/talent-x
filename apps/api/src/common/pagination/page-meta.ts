import { ApiProperty } from '@nestjs/swagger';

/** Métadonnées de pagination — schéma `PageMeta` du contrat. */
export class PageMetaDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  hasNext!: boolean;
}

/** Construit le `PageMeta` à partir du total et de la fenêtre demandée. */
export function buildPageMeta(total: number, page: number, limit: number): PageMetaDto {
  return { total, page, limit, hasNext: page * limit < total };
}

/**
 * Traduit un paramètre `sort` (`field` ou `-field`) en `orderBy` Prisma, restreint
 * à une liste blanche de champs triables (évite l'injection de champ arbitraire).
 * Retourne `fallback` si `sort` est absent ou hors liste.
 */
export function parseSort<T extends string>(
  sort: string | undefined,
  allowed: readonly T[],
  fallback: { [k in T]?: 'asc' | 'desc' },
): { [k in T]?: 'asc' | 'desc' } {
  if (!sort) return fallback;
  const desc = sort.startsWith('-');
  const field = (desc ? sort.slice(1) : sort) as T;
  if (!allowed.includes(field)) return fallback;
  return { [field]: desc ? 'desc' : 'asc' } as { [k in T]?: 'asc' | 'desc' };
}

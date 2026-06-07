import type { PageMetaDto } from '../dto/page-meta.dto';

/**
 * Enveloppe de liste paginée `{ data, meta }` imposée par le contrat OpenAPI
 * (schémas `*Page` : GroupPage, SessionPage, …).
 */
export interface Paginated<T> {
  data: T[];
  meta: PageMetaDto;
}

/** Construit l'enveloppe paginée à partir d'un total et des paramètres de page. */
export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    data,
    meta: { total, page, limit, hasNext: page * limit < total },
  };
}

/**
 * Clé de cache de la bibliothèque de modèles (C-10, ADR-29). Préfixée par `['sessions']`
 * pour qu'une invalidation non-exacte de `['sessions']` (constructeur C-05) rafraîchisse
 * aussi la bibliothèque.
 */
export const SESSION_TEMPLATES_QUERY_KEY = ['sessions', 'templates'] as const;

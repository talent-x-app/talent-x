/**
 * Traduction des erreurs techniques en messages utilisateur (TLX-010).
 *
 * Les erreurs proviennent du client API généré (orval) sous la forme d'une
 * enveloppe `{ status, data }` où `data` suit le schéma `Error` du contrat
 * (`docs/talent-x-openapi.yaml`). Une erreur réseau (pas de réponse) n'a pas
 * de `status`. On ne montre jamais de détail technique brut à l'utilisateur.
 */

export interface UserMessage {
  title: string;
  description?: string;
}

/** Statut HTTP porté par l'enveloppe d'erreur orval, si présent. */
function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

/** Message lisible renvoyé par l'API (`data.message`), si présent. */
function apiMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data: unknown }).data;
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) return message;
    }
  }
  return undefined;
}

/**
 * Convertit une erreur quelconque en message utilisateur français.
 * Sans `status` → erreur réseau (le bandeau hors-ligne couvre déjà la
 * connectivité, mais une requête peut échouer ponctuellement).
 */
export function toUserMessage(error: unknown): UserMessage {
  const status = statusOf(error);

  if (status === undefined) {
    return {
      title: 'Connexion impossible',
      description: 'Vérifiez votre connexion internet et réessayez.',
    };
  }
  if (status === 401) {
    return { title: 'Session expirée', description: 'Reconnectez-vous pour continuer.' };
  }
  if (status === 403) {
    return {
      title: 'Accès refusé',
      description: apiMessage(error) ?? "Vous n'avez pas les droits pour cette action.",
    };
  }
  if (status === 404) {
    return { title: 'Introuvable', description: apiMessage(error) };
  }
  if (status === 422) {
    return {
      title: 'Saisie invalide',
      description: apiMessage(error) ?? 'Vérifiez les champs et réessayez.',
    };
  }
  if (status >= 500) {
    return {
      title: 'Erreur serveur',
      description: 'Un problème est survenu de notre côté. Réessayez dans un instant.',
    };
  }
  return { title: 'Une erreur est survenue', description: apiMessage(error) };
}

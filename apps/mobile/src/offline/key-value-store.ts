/**
 * Petite abstraction de stockage clé→valeur asynchrone (TLX-077). Les modules de
 * persistance hors-ligne (brouillon de perf, file d'écriture) en dépendent par
 * **injection** → ils restent purs et testables avec un magasin en mémoire.
 *
 * L'implémentation par défaut (`deviceStore`) réutilise l'adaptateur de stockage
 * persistant déjà branché par plateforme (`secure-storage` : trousseau OS sur
 * natif, `localStorage` sur web). Les brouillons/files ne sont pas des secrets,
 * mais ils contiennent des données personnelles de l'athlète → le trousseau
 * chiffré reste le bon réceptacle, et l'on évite d'ajouter une dépendance native.
 */
import { secureDelete, secureGet, secureSet } from '../auth/secure-storage';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Magasin de production : adaptateur persistant par plateforme (cf. `secure-storage`). */
export const deviceStore: KeyValueStore = {
  getItem: secureGet,
  setItem: secureSet,
  removeItem: secureDelete,
};

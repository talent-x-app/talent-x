import { Injectable } from '@nestjs/common';

/** Archive d'export prête à déposer sur le stockage objet. */
export interface ExportArchive {
  body: Buffer | string;
  contentType: string;
  /** Nom de fichier suggéré (sert à dériver l'extension de la clé objet). */
  filename: string;
}

/**
 * Point d'extension : assemble le contenu de l'export RGPD d'un utilisateur.
 *
 * TLX-035 livre la **plomberie** (file → worker → stockage objet → statut) ; la
 * collecte effective des données de la personne et leur sérialisation relèvent de
 * **TLX-033**, qui remplacera le binding par défaut par une implémentation réelle.
 */
@Injectable()
export abstract class ExportArchiveBuilder {
  abstract build(userId: string): Promise<ExportArchive>;
}

/**
 * Binding par défaut tant que TLX-033 n'a pas livré le contenu réel. Le worker
 * boote et la plomberie tourne ; un job traité passe alors à `failed` avec un
 * message explicite plutôt que de produire une archive vide.
 */
@Injectable()
export class PlaceholderExportArchiveBuilder extends ExportArchiveBuilder {
  build(_userId: string): Promise<ExportArchive> {
    return Promise.reject(
      new Error(
        'ExportArchiveBuilder non implémenté — contenu de l’export RGPD à livrer (TLX-033)',
      ),
    );
  }
}

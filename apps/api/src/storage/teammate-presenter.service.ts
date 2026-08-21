import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from './object-storage.service';

const DEFAULT_AVATAR_READ_TTL_SECONDS = 3600;

/** Athlète tel que lu en base (sélection minimisée) — entrée du présentateur. */
export interface MinimalAthlete {
  id: string;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
}

/** Vue pair-à-pair minimisée (schéma `GroupTeammate`, ADR-37) — identité + avatar présigné. */
export interface TeammateView {
  id: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

/**
 * Présente une identité **minimisée** d'athlète à un pair (ADR-37 : nom + avatar, rien d'autre),
 * en présignant l'avatar **best-effort** (TTL `AVATAR_URL_TTL_SECONDS`, défaut 1 h). Factorisé ici
 * pour être réutilisé partout où l'on expose un coéquipier : roster (ADR-37), auteurs de réactions
 * et kudos (ADR-48/ADR-49, Palier 2). En cas d'échec de présignature (stockage indisponible en
 * dev/test), l'avatar est **omis** et le client retombe sur les initiales.
 */
@Injectable()
export class TeammatePresenter {
  constructor(
    private readonly storage: ObjectStorageService,
    private readonly config: ConfigService,
  ) {}

  private ttl(): number {
    return this.config.get<number>('AVATAR_URL_TTL_SECONDS') ?? DEFAULT_AVATAR_READ_TTL_SECONDS;
  }

  /**
   * Présigne une clé d'avatar **best-effort** : `undefined` s'il n'y a pas de photo **ou** si le
   * stockage est indisponible (dev/test) — le client retombe alors sur les initiales.
   *
   * Exposé séparément de `present` (TLX-252) pour les surfaces qui portent déjà leur propre forme
   * de sortie — `LinkedUserSummary` (roster coach, carte « Ton coach »), `DashboardAthlete` — et
   * n'ont besoin que de cette règle-là, pas de la vue pair-à-pair minimisée.
   */
  async presignAvatar(photoUrl: string | null | undefined): Promise<string | undefined> {
    if (!photoUrl) return undefined;
    try {
      return await this.storage.getPresignedDownloadUrl(photoUrl, this.ttl());
    } catch {
      return undefined;
    }
  }

  /** Mappe un athlète vers la vue pair, avatar présigné best-effort. */
  async present(athlete: MinimalAthlete): Promise<TeammateView> {
    return {
      id: athlete.id,
      firstName: athlete.firstName ?? undefined,
      lastName: athlete.lastName ?? undefined,
      avatarUrl: await this.presignAvatar(athlete.photoUrl),
    };
  }

  /** Présente une liste d'athlètes (présignatures en parallèle). */
  presentMany(athletes: MinimalAthlete[]): Promise<TeammateView[]> {
    return Promise.all(athletes.map((a) => this.present(a)));
  }
}

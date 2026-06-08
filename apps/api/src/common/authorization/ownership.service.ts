import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Autorisations transverses : appartenance (lien coach↔athlète actif) et propriété
 * (ownership) des ressources. Source de vérité : matrice TX-SPEC-002 §6 / TX-ARCH-001 §9.
 *
 * Le rôle (RBAC) est appliqué en amont par le `RolesGuard` global via `@Roles`.
 * Ces vérifications-ci nécessitent un accès base (entité à charger) ; elles sont
 * donc exposées comme service réutilisable et appelées par les services métier,
 * jamais réimplémentées ad hoc endpoint par endpoint (cf. TX-ARCH-001 §9).
 *
 * Convention de codes : ressource inexistante → 404 `NOT_FOUND` ; ressource
 * existante mais non accessible → 403 `FORBIDDEN` (pas de fuite d'existence sur
 * un défaut de rôle/appartenance, mais 404 franc si la ligne n'existe pas).
 */
@Injectable()
export class OwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appartenance : un lien coach↔athlète est-il actif (non terminé) ?
   * Base du contrôle « le coach n'accède qu'à ses athlètes liés » (TX-ARCH-001 §9.1).
   */
  async isCoachLinkedToAthlete(coachId: string, athleteId: string): Promise<boolean> {
    const link = await this.prisma.coachAthleteLink.findFirst({
      where: { coachId, athleteId, endedAt: null },
      select: { id: true },
    });
    return link !== null;
  }

  /** Variante levée : 403 si aucun lien coach↔athlète actif. */
  async assertCoachLinkedToAthlete(coachId: string, athleteId: string): Promise<void> {
    if (!(await this.isCoachLinkedToAthlete(coachId, athleteId))) {
      throw new ForbiddenException('Aucun lien actif avec cet athlète.');
    }
  }

  /**
   * Ownership d'une séance : `session.coach_id = coachId` (et séance non supprimée).
   * 404 si la séance n'existe pas / est supprimée ; 403 si elle appartient à un autre coach.
   */
  async assertSessionOwnedByCoach(coachId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, deletedAt: null },
      select: { coachId: true },
    });
    if (!session) {
      throw new NotFoundException('Séance introuvable.');
    }
    if (session.coachId !== coachId) {
      throw new ForbiddenException('Cette séance ne vous appartient pas.');
    }
  }

  /**
   * Ownership d'un groupe : `group.coach_id = coachId` (et groupe non supprimé).
   * 404 si le groupe n'existe pas / est supprimé ; 403 s'il appartient à un autre coach.
   */
  async assertGroupOwnedByCoach(coachId: string, groupId: string): Promise<void> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { coachId: true },
    });
    if (!group) {
      throw new NotFoundException('Groupe introuvable.');
    }
    if (group.coachId !== coachId) {
      throw new ForbiddenException('Ce groupe ne vous appartient pas.');
    }
  }

  /**
   * Propriété du compte : une ressource `users.me.*` n'est accessible que par son
   * titulaire (export, suppression, consentements…). 403 sinon.
   */
  assertAccountOwner(currentUserId: string, targetUserId: string): void {
    if (currentUserId !== targetUserId) {
      throw new ForbiddenException('Accès limité au titulaire du compte.');
    }
  }
}

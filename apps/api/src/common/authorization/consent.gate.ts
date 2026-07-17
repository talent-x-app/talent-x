import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { type ConsentType } from '../../users/dto/consent.dto';

/**
 * Gating consentement (TLX-032) — 4ᵉ niveau du modèle d'autorisation (TX-ARCH-001
 * §9, matrice TX-SPEC-002 §6). Le consentement est une **condition d'autorisation**
 * (RB-08), pas un simple réglage : certaines actions sur des données sensibles sont
 * bloquées tant que le consentement requis n'est pas actif.
 *
 * État courant d'un consentement = dernière ligne par (user_id, type) dans la table
 * append-only `consents` (cf. ConsentsService, TLX-031). Actif = cette dernière
 * ligne a `granted = true`.
 *
 * TLX-187 (ADR-51 §D2a) — dimension coach : `coach_access` peut être scopé à un
 * coach (`coach_id`). Pour une porte coach, l'état courant = **dernière ligne
 * applicable** parmi les lignes scopées à ce coach OU globales (`coach_id` NULL,
 * historique) — une décision globale plus récente l'emporte, dans les deux sens.
 * Sans `coachId` (portes `data_processing` du titulaire), seules les lignes
 * globales comptent : comportement historique inchangé.
 *
 * Usages prévus (endpoints livrés par leurs tickets) :
 *  - `POST /performances` → consentement `data_processing` de l'athlète (TLX-070) ;
 *  - `GET /athletes/:id/stats` & lecture perf côté coach → `coach_access` de
 *    l'athlète ciblé **pour ce coach**, en plus du lien coach↔athlète actif
 *    (TLX-080/086, ADR-51).
 */
@Injectable()
export class ConsentGate {
  constructor(private readonly prisma: PrismaService) {}

  /** Le consentement `type` de `userId` est-il actif (pour `coachId` s'il est fourni) ? */
  async hasActiveConsent(userId: string, type: ConsentType, coachId?: string): Promise<boolean> {
    const current = await this.prisma.consent.findFirst({
      where: {
        userId,
        type,
        ...(coachId != null ? { OR: [{ coachId }, { coachId: null }] } : { coachId: null }),
      },
      orderBy: { createdAt: 'desc' },
      select: { granted: true },
    });
    return current?.granted === true;
  }

  /**
   * Bloque l'action si le consentement requis n'est pas actif.
   * Lève 403 `CONSENT_REQUIRED` (code stable conservé par AllExceptionsFilter).
   */
  async assertActiveConsent(userId: string, type: ConsentType, coachId?: string): Promise<void> {
    if (!(await this.hasActiveConsent(userId, type, coachId))) {
      throw new ForbiddenException({
        error: 'CONSENT_REQUIRED',
        message: 'Consentement requis pour cette action.',
      });
    }
  }
}

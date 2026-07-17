import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Consent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type ConsentDto, type ConsentListDto, type ConsentType } from './dto/consent.dto';
import { type ConsentUpdateDto } from './dto/consent-update.dto';

/**
 * Consentements RGPD (TLX-031) — TX-SEC-003 §6.
 *
 * Table `consents` **append-only** : chaque changement crée une nouvelle ligne ;
 * l'état courant d'un consentement est la dernière ligne par (user_id, type).
 * Aucune mise à jour en place — l'historique est la preuve juridique.
 *
 * Versionnage : on enregistre la version du texte présentée à l'utilisateur
 * (`text_version`) ; à défaut de version fournie par le client, la version
 * courante configurée (CONSENT_TEXT_VERSION) est utilisée.
 */
@Injectable()
export class ConsentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * État courant des consentements du titulaire : dernière ligne par (type, coach).
   * ADR-51 §D2 : un `coach_access` scopé apparaît comme une entrée distincte de
   * l'entrée globale — le client compose la vue par coach (scopé sinon global).
   */
  async list(userId: string): Promise<ConsentListDto> {
    const latest = await this.prisma.consent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      distinct: ['type', 'coachId'],
    });
    return { data: latest.map(toConsentDto) };
  }

  /**
   * Donne ou retire un consentement : insère une nouvelle ligne historisée.
   * `granted_at`/`revoked_at` reflètent l'action ; renvoie l'état courant créé.
   * `coachId` (ADR-51 §D2) scope la décision à un coach — `coach_access` seulement.
   */
  async update(userId: string, dto: ConsentUpdateDto): Promise<ConsentDto> {
    if (dto.coachId != null && dto.type !== 'coach_access') {
      throw new UnprocessableEntityException({
        error: 'CONSENT_COACH_SCOPE_INVALID',
        message: 'Seul le consentement coach_access peut être scopé à un coach.',
      });
    }
    const now = new Date();
    const textVersion = dto.textVersion ?? this.config.get<string>('CONSENT_TEXT_VERSION') ?? '';

    const created = await this.prisma.consent.create({
      data: {
        userId,
        type: dto.type,
        granted: dto.granted,
        textVersion,
        coachId: dto.coachId ?? null,
        grantedAt: dto.granted ? now : null,
        revokedAt: dto.granted ? null : now,
      },
    });
    return toConsentDto(created);
  }
}

/** Projette une ligne `consents` Prisma vers le DTO public `Consent`. */
function toConsentDto(consent: Consent): ConsentDto {
  return {
    type: consent.type as ConsentType,
    granted: consent.granted,
    textVersion: consent.textVersion,
    ...(consent.coachId != null ? { coachId: consent.coachId } : {}),
    updatedAt: consent.createdAt.toISOString(),
  };
}

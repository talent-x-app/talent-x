import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationQueueService } from '../jobs/notification-queue.service';
import { TeammatePresenter } from '../storage/teammate-presenter.service';
import { KudosSummaryDto, TeammateAttendanceListDto } from './dto/kudos.dto';

const DEFAULT_KUDOS_GIVERS_CAP = 8;
const ATTENDANCE_GOING = 'going';

/** Sélection minimisée d'un athlète (identité + avatar) — pour la présentation pair-à-pair. */
const ATHLETE_SELECT = {
  select: { id: true, firstName: true, lastName: true, photoUrl: true },
} as const;

/**
 * Kudos de participation entre coéquipiers (ADR-48/ADR-49, Mur Palier 2). Un athlète encourage 👏
 * la **présence confirmée** (`attendance='going'`, ADR-43) d'un coéquipier sur une séance de
 * groupe partagée. **Invariant dur (ADR-08/21)** : porte sur la *participation*, jamais sur la
 * performance/charge/record. L'API n'expose que l'agrégat + les auteurs **minimisés**
 * (`GroupTeammate`, ADR-37). Visibilité de présence pair-à-pair actée en TX-DPIA-007 §5.6.
 */
@Injectable()
export class KudosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly teammates: TeammatePresenter,
    private readonly config: ConfigService,
  ) {}

  private giversCap(): number {
    return this.config.get<number>('KUDOS_GIVERS_CAP') ?? DEFAULT_KUDOS_GIVERS_CAP;
  }

  /**
   * Coéquipiers d'un groupe partagé ayant confirmé leur présence (`going`) sur la **même** séance
   * que l'affectation `{id}` de l'appelant (titulaire). Identité minimisée + kudos agrégés. Exclut
   * l'appelant, les membres partis et les comptes anonymisés. 404 si l'affectation n'est pas la
   * sienne ; liste vide si la séance n'a pas de provenance de groupe (affectation individuelle).
   */
  async listTeammatesAttendance(
    user: AuthenticatedUser,
    assignmentId: string,
  ): Promise<TeammateAttendanceListDto> {
    const mine = await this.prisma.sessionAssignment.findFirst({
      where: { id: assignmentId, athleteId: user.id, deletedAt: null },
      select: { sessionId: true, groupAssignment: { select: { groupId: true } } },
    });
    if (!mine) throw new NotFoundException('Affectation introuvable.');
    const groupId = mine.groupAssignment?.groupId;
    if (!groupId) return { data: [] };

    const siblings = await this.prisma.sessionAssignment.findMany({
      where: {
        sessionId: mine.sessionId,
        attendance: ATTENDANCE_GOING,
        deletedAt: null,
        athleteId: { not: user.id },
        groupAssignment: { groupId, deletedAt: null },
        // Membre ACTIF du même groupe + compte non anonymisé (minimisation, ADR-37).
        athlete: { deletedAt: null, groupMemberships: { some: { groupId, leftAt: null } } },
      },
      select: {
        id: true,
        athlete: ATHLETE_SELECT,
        kudos: {
          select: { giverId: true, giver: ATHLETE_SELECT },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });

    const data = await Promise.all(
      siblings.map(async (s) => ({
        assignmentId: s.id,
        teammate: await this.teammates.present(s.athlete),
        kudos: await this.toKudosSummary(s.kudos, user.id),
      })),
    );
    return { data };
  }

  /**
   * Pose un kudos sur l'affectation `{id}` d'un coéquipier (idempotent). Gardes : l'appelant est
   * **membre actif** du groupe de provenance de la séance ; la présence cible est **`going`** ;
   * pas d'auto-kudos. Notifie le destinataire (`group_kudos`, gate `groupUpdates`).
   */
  async give(user: AuthenticatedUser, assignmentId: string): Promise<KudosSummaryDto> {
    const target = await this.assertKudosTarget(user, assignmentId);
    await this.prisma.participationKudos.upsert({
      where: { assignmentId_giverId: { assignmentId, giverId: user.id } },
      create: { assignmentId, giverId: user.id },
      update: {},
    });
    // resourceId = séance (ADR-10) → tap ouvre la séance. Contenu push minimal, aucun nom.
    await this.notificationQueue.enqueue(
      { type: 'group_kudos', recipientUserId: target.athleteId, resourceId: target.sessionId },
      `group_kudos--${assignmentId}--${user.id}`,
    );
    return this.summary(assignmentId, user.id);
  }

  /** Retire son kudos (idempotent — sans erreur si absent). Mêmes gardes que la pose. */
  async remove(user: AuthenticatedUser, assignmentId: string): Promise<KudosSummaryDto> {
    await this.assertKudosTarget(user, assignmentId);
    await this.prisma.participationKudos.deleteMany({
      where: { assignmentId, giverId: user.id },
    });
    return this.summary(assignmentId, user.id);
  }

  /**
   * Valide qu'un kudos est permis sur `{id}` par `user` et renvoie la cible. 404 anti-énumération
   * (cible inexistante, hors séance de groupe, appelant non membre du groupe). 422 pour l'auto-kudos
   * ou une présence non confirmée (cas identifiables par un membre, signalés explicitement).
   */
  private async assertKudosTarget(
    user: AuthenticatedUser,
    assignmentId: string,
  ): Promise<{ athleteId: string; sessionId: string }> {
    const target = await this.prisma.sessionAssignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      select: {
        athleteId: true,
        sessionId: true,
        attendance: true,
        groupAssignment: { select: { groupId: true, deletedAt: true } },
      },
    });
    const groupId = target?.groupAssignment?.groupId;
    if (!target || !groupId || target.groupAssignment?.deletedAt) {
      throw new NotFoundException('Affectation introuvable.');
    }
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, athleteId: user.id, leftAt: null, group: { deletedAt: null } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Affectation introuvable.');
    if (target.athleteId === user.id) {
      throw new UnprocessableEntityException({
        error: 'KUDOS_SELF_FORBIDDEN',
        message: 'On ne peut pas s’encourager soi-même.',
      });
    }
    if (target.attendance !== ATTENDANCE_GOING) {
      throw new UnprocessableEntityException({
        error: 'KUDOS_TARGET_NOT_GOING',
        message: 'Le kudos ne s’applique qu’à une présence confirmée.',
      });
    }
    return { athleteId: target.athleteId, sessionId: target.sessionId };
  }

  /** Agrégat de kudos d'une affectation (compteur + auteurs minimisés plafonnés + `mine`). */
  private async summary(assignmentId: string, userId: string): Promise<KudosSummaryDto> {
    const kudos = await this.prisma.participationKudos.findMany({
      where: { assignmentId },
      select: { giverId: true, giver: ATHLETE_SELECT },
      orderBy: { createdAt: 'asc' },
    });
    return this.toKudosSummary(kudos, userId);
  }

  /** Mappe des lignes de kudos vers le DTO agrégé (auteurs plafonnés, présignés). */
  private async toKudosSummary(
    kudos: Array<{
      giverId: string;
      giver: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        photoUrl: string | null;
      };
    }>,
    userId: string,
  ): Promise<KudosSummaryDto> {
    const cap = this.giversCap();
    return {
      count: kudos.length,
      mine: kudos.some((k) => k.giverId === userId),
      givers: await this.teammates.presentMany(kudos.slice(0, cap).map((k) => k.giver)),
    };
  }
}

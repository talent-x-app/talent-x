import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Comment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import { ConsentGate } from '../common/authorization/consent.gate';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPageMeta } from '../common/pagination/page-meta';
import { NotificationQueueService } from '../jobs/notification-queue.service';
import { CommentCreateDto } from './dto/comment-create.dto';
import { CommentDto, CommentPageDto } from './dto/comment.dto';
import { CommentQueryDto } from './dto/comment-query.dto';

/**
 * Collaboration — commentaires rattachés à une **séance** ou une **performance**
 * (TLX-086, carte C-08). Autorisation (matrice TX-SPEC-002 §6) : seule une **partie
 * liée** à la cible peut commenter / lister :
 *  - performance → athlète titulaire, **ou** coach propriétaire de la séance avec lien
 *    actif **et** consentement `coach_access` de l'athlète (mêmes portes que la lecture
 *    de la performance, RB-05) ;
 *  - séance → coach propriétaire, **ou** athlète affecté à cette séance.
 * La suppression est réservée à l'auteur (« supprimer son commentaire »), en soft-delete.
 *
 * Effet métier clé : un commentaire de coach sur une performance la fait sortir de
 * « à revoir » (la dérivation du tableau de bord compte les perfs **sans** commentaire
 * coach — cf. CoachInsightsService).
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly consent: ConsentGate,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  /** Crée un commentaire sur l'unique cible fournie (séance XOR performance). */
  async createComment(user: AuthenticatedUser, dto: CommentCreateDto): Promise<CommentDto> {
    const target = exactlyOneTarget(dto.sessionId, dto.performanceId);
    let performance: PerformanceTarget | undefined;
    if (target === 'performance') {
      performance = await this.assertCanAccessPerformance(user, dto.performanceId!);
    } else {
      await this.assertCanAccessSession(user, dto.sessionId!);
    }

    const comment = await this.prisma.comment.create({
      data: {
        authorId: user.id,
        sessionId: dto.sessionId ?? null,
        performanceId: dto.performanceId ?? null,
        body: dto.body,
      },
    });

    // Feedback du coach sur une performance → notifie l'athlète (ADR-22).
    // resourceId = affectation : c'est la ressource navigable côté athlète
    // (le fil de feedback A-09 vit sur le détail de séance, indexé par affectation).
    if (user.role === 'coach' && target === 'performance' && performance) {
      await this.notificationQueue.enqueue(
        {
          type: 'performance_feedback',
          recipientUserId: performance.athleteId,
          resourceId: performance.assignmentId,
        },
        // « : » est interdit dans un jobId BullMQ (séparateur interne de clés Redis).
        `performance_feedback--${comment.id}`,
      );
    }
    return toCommentDto(comment);
  }

  /** Liste paginée des commentaires d'une cible (ordre chronologique). */
  async listComments(user: AuthenticatedUser, q: CommentQueryDto): Promise<CommentPageDto> {
    const target = exactlyOneTarget(q.sessionId, q.performanceId);
    if (target === 'performance') {
      await this.assertCanAccessPerformance(user, q.performanceId!);
    } else {
      await this.assertCanAccessSession(user, q.sessionId!);
    }

    const where = {
      deletedAt: null,
      ...(target === 'performance'
        ? { performanceId: q.performanceId }
        : { sessionId: q.sessionId }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.comment.count({ where }),
    ]);
    return { data: rows.map(toCommentDto), meta: buildPageMeta(total, q.page, q.limit) };
  }

  /** Supprime (soft-delete) son propre commentaire. 403 si non-auteur, 404 si introuvable. */
  async deleteComment(user: AuthenticatedUser, id: string): Promise<void> {
    const comment = await this.prisma.comment.findFirst({ where: { id, deletedAt: null } });
    if (!comment) {
      throw new NotFoundException('Commentaire introuvable.');
    }
    if (comment.authorId !== user.id) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres commentaires.');
    }
    await this.prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /**
   * Accès à une performance cible : athlète titulaire, ou coach propriétaire de la séance
   * (lien actif + consentement `coach_access`). Mêmes règles que la lecture de la perf.
   * Renvoie titulaire + affectation (destinataire et cible d'une éventuelle notification).
   */
  private async assertCanAccessPerformance(
    user: AuthenticatedUser,
    performanceId: string,
  ): Promise<PerformanceTarget> {
    const performance = await this.prisma.performance.findUnique({
      where: { id: performanceId },
      select: {
        athleteId: true,
        assignmentId: true,
        assignment: { select: { session: { select: { coachId: true } } } },
      },
    });
    if (!performance) {
      throw new NotFoundException('Performance introuvable.');
    }
    if (user.role === 'coach') {
      if (performance.assignment.session.coachId !== user.id) {
        throw new ForbiddenException('Cette performance ne vous est pas accessible.');
      }
      await this.ownership.assertCoachLinkedToAthlete(user.id, performance.athleteId);
      await this.consent.assertActiveConsent(performance.athleteId, 'coach_access');
    } else if (performance.athleteId !== user.id) {
      throw new ForbiddenException('Cette performance ne vous appartient pas.');
    }
    return { athleteId: performance.athleteId, assignmentId: performance.assignmentId };
  }

  /** Accès à une séance cible : coach propriétaire, ou athlète affecté (lien à la séance). */
  private async assertCanAccessSession(user: AuthenticatedUser, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, deletedAt: null },
      select: { coachId: true },
    });
    if (!session) {
      throw new NotFoundException('Séance introuvable.');
    }
    if (user.role === 'coach') {
      if (session.coachId !== user.id) {
        throw new ForbiddenException('Cette séance ne vous appartient pas.');
      }
      return;
    }
    const assigned = await this.prisma.sessionAssignment.findFirst({
      where: { sessionId, athleteId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!assigned) {
      throw new ForbiddenException('Cette séance ne vous est pas accessible.');
    }
  }
}

/** Titulaire + affectation d'une performance cible (notification ADR-22/23). */
interface PerformanceTarget {
  athleteId: string;
  assignmentId: string;
}

/** Vérifie qu'exactement une cible est fournie ; renvoie laquelle. 400 sinon. */
function exactlyOneTarget(sessionId?: string, performanceId?: string): 'session' | 'performance' {
  if (Boolean(sessionId) === Boolean(performanceId)) {
    throw new BadRequestException('Renseigner exactement une cible : sessionId OU performanceId.');
  }
  return performanceId ? 'performance' : 'session';
}

function toCommentDto(comment: Comment): CommentDto {
  return {
    id: comment.id,
    authorId: comment.authorId,
    sessionId: comment.sessionId ?? undefined,
    performanceId: comment.performanceId ?? undefined,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
  };
}

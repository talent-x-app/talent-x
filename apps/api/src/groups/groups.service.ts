import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Group } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { buildPageMeta, parseSort } from '../common/pagination/page-meta';
import { GroupDto, GroupPageDto } from './dto/group.dto';
import { GroupCreateDto } from './dto/group-create.dto';
import { GroupUpdateDto } from './dto/group-update.dto';
import { GroupMemberPageDto, GroupMemberDto } from './dto/group-member.dto';
import { AthleteGroupDto, AthleteGroupListDto } from './dto/athlete-group.dto';
import { InviteCodeDto, type InviteCodeAction } from './dto/invite-code.dto';
import { generateInviteCode } from './invite-code';
import { NotificationQueueService } from '../jobs/notification-queue.service';

const GROUP_SORTABLE = ['createdAt', 'name', 'updatedAt'] as const;
const MAX_CODE_ATTEMPTS = 5;

/**
 * Groupes d'entraînement (TLX-041). Source d'autorisation (matrice TX-SPEC-002 §6) :
 * `groups.*` hors join/leave → coach **propriétaire** du groupe ; `join` → athlète
 * avec **code valide** ; `leave` → athlète **membre actif**. Le RBAC (rôle) est posé
 * par le `RolesGuard` global ; l'ownership de groupe par `OwnershipService`.
 *
 * Le lien `coach_athlete_links` (source `group`) est de niveau **coach↔athlète** (un
 * seul actif par couple, cf. index unique partiel), pas par groupe : il est créé au
 * 1ᵉʳ groupe rejoint et terminé seulement quand l'athlète quitte le **dernier** groupe
 * de ce coach.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  async createGroup(coachId: string, dto: GroupCreateDto): Promise<GroupDto> {
    const group = await this.createWithUniqueCode(coachId, dto);
    return toGroupDto(group, 0);
  }

  async listGroups(coachId: string, q: PaginationQueryDto): Promise<GroupPageDto> {
    const where: Prisma.GroupWhereInput = { coachId, deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where,
        include: activeMemberCount,
        orderBy: parseSort(q.sort, GROUP_SORTABLE, { createdAt: 'desc' }),
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.group.count({ where }),
    ]);
    return {
      data: rows.map((r) => toGroupDto(r, r._count.members)),
      meta: buildPageMeta(total, q.page, q.limit),
    };
  }

  /**
   * Groupes actifs de l'athlète courant + résumé coach (ADR-26). Lecture dérivée :
   * appartenances `left_at IS NULL` dont le groupe n'est pas supprimé. Ne renvoie
   * jamais le code d'invitation (réservé au coach propriétaire, ADR-16).
   */
  async listMyGroups(athleteId: string): Promise<AthleteGroupListDto> {
    const rows = await this.prisma.groupMember.findMany({
      where: { athleteId, leftAt: null, group: { deletedAt: null } },
      include: {
        group: {
          include: {
            coach: { select: { id: true, firstName: true, lastName: true, sport: true } },
            ...activeMemberCount,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return { data: rows.map(toAthleteGroupDto) };
  }

  async getGroup(coachId: string, id: string): Promise<GroupDto> {
    await this.ownership.assertGroupOwnedByCoach(coachId, id);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id },
      include: activeMemberCount,
    });
    return toGroupDto(group, group._count.members);
  }

  async updateGroup(coachId: string, id: string, dto: GroupUpdateDto): Promise<GroupDto> {
    await this.ownership.assertGroupOwnedByCoach(coachId, id);
    const group = await this.prisma.group.update({
      where: { id },
      data: definedOnly(dto),
      include: activeMemberCount,
    });
    return toGroupDto(group, group._count.members);
  }

  /** Soft-delete : termine aussi les appartenances actives et les liens devenus orphelins. */
  async deleteGroup(coachId: string, id: string): Promise<void> {
    await this.ownership.assertGroupOwnedByCoach(coachId, id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const members = await tx.groupMember.findMany({
        where: { groupId: id, leftAt: null },
        select: { athleteId: true },
      });
      await tx.group.update({ where: { id }, data: { deletedAt: now } });
      await tx.groupMember.updateMany({
        where: { groupId: id, leftAt: null },
        data: { leftAt: now },
      });
      for (const { athleteId } of members) {
        await endLinkIfLastGroup(tx, coachId, athleteId, now);
      }
    });
  }

  async listGroupMembers(
    coachId: string,
    id: string,
    q: PaginationQueryDto,
  ): Promise<GroupMemberPageDto> {
    await this.ownership.assertGroupOwnedByCoach(coachId, id);
    const where: Prisma.GroupMemberWhereInput = { groupId: id, leftAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.groupMember.findMany({
        where,
        include: {
          athlete: { select: { id: true, firstName: true, lastName: true, sport: true } },
        },
        orderBy: { joinedAt: 'asc' },
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.groupMember.count({ where }),
    ]);
    return {
      data: rows.map(toGroupMemberDto),
      meta: buildPageMeta(total, q.page, q.limit),
    };
  }

  /** Retrait d'un membre par le coach. 404 si l'athlète n'est pas membre actif. */
  async removeGroupMember(coachId: string, id: string, athleteId: string): Promise<void> {
    await this.ownership.assertGroupOwnedByCoach(coachId, id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.groupMember.updateMany({
        where: { groupId: id, athleteId, leftAt: null },
        data: { leftAt: now },
      });
      if (count === 0) {
        throw new NotFoundException("Cet athlète n'est pas membre actif du groupe.");
      }
      await softDeleteFutureGroupAssignments(tx, id, athleteId, now);
      await endLinkIfLastGroup(tx, coachId, athleteId, now);
    });
  }

  async manageInviteCode(
    coachId: string,
    id: string,
    action: InviteCodeAction,
  ): Promise<InviteCodeDto> {
    await this.ownership.assertGroupOwnedByCoach(coachId, id);
    if (action === 'revoke') {
      await this.prisma.group.update({
        where: { id },
        data: { inviteCodeRevokedAt: new Date() },
      });
      return { inviteCode: null };
    }
    // regenerate : nouveau code unique + réactivation.
    const code = await this.regenerateUniqueCode(id);
    return { inviteCode: code };
  }

  /** Athlète rejoint via code actif. Idempotent si déjà membre actif. */
  async joinGroup(athleteId: string, inviteCode: string): Promise<GroupMemberDto> {
    const group = await this.prisma.group.findFirst({
      where: { inviteCode, deletedAt: null, inviteCodeRevokedAt: null },
      select: { id: true, coachId: true },
    });
    if (!group) {
      throw new NotFoundException("Code d'invitation invalide ou révoqué.");
    }
    const { member, created, newAssignmentIds } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.groupMember.findFirst({
        where: { groupId: group.id, athleteId, leftAt: null },
        include: { athlete: memberAthleteSelect },
      });
      const row =
        existing ??
        (await tx.groupMember.create({
          data: { groupId: group.id, athleteId },
          include: { athlete: memberAthleteSelect },
        }));
      await ensureGroupLink(tx, group.coachId, athleteId, group.id);
      // Réconciliation (ADR-30) : un nouveau membre hérite des affectations de groupe
      // **à venir et non datées** (jamais les séances passées/en retard).
      const newAssignmentIds = existing
        ? []
        : await materializeGroupAssignmentsForMember(tx, group.id, athleteId);
      return { member: row, created: !existing, newAssignmentIds };
    });

    // Nouvelle adhésion → notifie le coach propriétaire (ADR-22 : group_update)…
    if (created) {
      await this.notificationQueue.enqueue(
        { type: 'group_update', recipientUserId: group.coachId, resourceId: group.id },
        // « : » est interdit dans un jobId BullMQ (séparateur interne de clés Redis).
        `group_update--${member.id}`,
      );
      // …et l'athlète pour chaque séance à venir qu'il hérite du groupe (session_assigned).
      for (const assignmentId of newAssignmentIds) {
        await this.notificationQueue.enqueue(
          { type: 'session_assigned', recipientUserId: athleteId, resourceId: assignmentId },
          `session_assigned--${assignmentId}`,
        );
      }
    }
    return toGroupMemberDto(member);
  }

  /** Athlète quitte un groupe. 404 s'il n'en est pas membre actif. */
  async leaveGroup(athleteId: string, id: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const group = await tx.group.findFirst({
        where: { id, deletedAt: null },
        select: { coachId: true },
      });
      const { count } = await tx.groupMember.updateMany({
        where: { groupId: id, athleteId, leftAt: null },
        data: { leftAt: now },
      });
      if (!group || count === 0) {
        throw new NotFoundException("Vous n'êtes pas membre actif de ce groupe.");
      }
      await softDeleteFutureGroupAssignments(tx, id, athleteId, now);
      await endLinkIfLastGroup(tx, group.coachId, athleteId, now);
    });
  }

  /** Création avec retry sur collision du code unique. */
  private async createWithUniqueCode(coachId: string, dto: GroupCreateDto): Promise<Group> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.group.create({
          data: {
            coachId,
            name: dto.name,
            description: dto.description,
            inviteCode: generateInviteCode(),
          },
        });
      } catch (error) {
        if (isUniqueViolation(error) && attempt < MAX_CODE_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new Error('Génération du code d’invitation impossible (collisions répétées).');
  }

  /** Regénère le code (unique) et lève la révocation. */
  private async regenerateUniqueCode(id: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateInviteCode();
      try {
        await this.prisma.group.update({
          where: { id },
          data: { inviteCode: code, inviteCodeRevokedAt: null },
        });
        return code;
      } catch (error) {
        if (isUniqueViolation(error) && attempt < MAX_CODE_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new Error('Génération du code d’invitation impossible (collisions répétées).');
  }
}

/** Sélection du résumé athlète embarqué dans un membre. */
const memberAthleteSelect = {
  select: { id: true, firstName: true, lastName: true, sport: true },
} satisfies Prisma.GroupMemberInclude['athlete'];

/** Compte des membres actifs, embarqué via `_count`. */
const activeMemberCount = {
  _count: { select: { members: { where: { leftAt: null } } } },
} satisfies Prisma.GroupInclude;

/** Minuit UTC du jour de `d` — borne « à venir » alignée sur les `dueDate` calendaires. */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Réconciliation à l'adhésion (ADR-30) : matérialise pour `athleteId` une affectation
 * par affectation de groupe **active, à venir ou non datée** (jamais les passées). Idempotent
 * (saute les couples séance/athlète déjà affectés). Retourne les ids créés (→ notifications).
 */
async function materializeGroupAssignmentsForMember(
  tx: Prisma.TransactionClient,
  groupId: string,
  athleteId: string,
): Promise<string[]> {
  const today = startOfUtcDay(new Date());
  const groupAssignments = await tx.groupAssignment.findMany({
    where: { groupId, deletedAt: null, OR: [{ dueDate: null }, { dueDate: { gte: today } }] },
    select: { id: true, sessionId: true, dueDate: true },
  });
  const createdIds: string[] = [];
  for (const ga of groupAssignments) {
    const existing = await tx.sessionAssignment.findFirst({
      where: { sessionId: ga.sessionId, athleteId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      const created = await tx.sessionAssignment.create({
        data: {
          sessionId: ga.sessionId,
          athleteId,
          dueDate: ga.dueDate ?? undefined,
          groupAssignmentId: ga.id,
        },
        select: { id: true },
      });
      createdIds.push(created.id);
    }
  }
  return createdIds;
}

/**
 * Réconciliation à la sortie (ADR-30) : soft-delete les affectations de `athleteId`
 * **issues de ce groupe**, encore `assigned` et **à venir / non datées** (non commencées).
 * Préserve l'historique : `completed`/`in_progress`/`skipped` et les séances passées
 * ne sont jamais touchés ; les affectations **individuelles** non plus (provenance nulle).
 */
async function softDeleteFutureGroupAssignments(
  tx: Prisma.TransactionClient,
  groupId: string,
  athleteId: string,
  now: Date,
): Promise<void> {
  const groupAssignments = await tx.groupAssignment.findMany({
    where: { groupId },
    select: { id: true },
  });
  const ids = groupAssignments.map((g) => g.id);
  if (ids.length === 0) return;
  await tx.sessionAssignment.updateMany({
    where: {
      athleteId,
      groupAssignmentId: { in: ids },
      status: 'assigned',
      deletedAt: null,
      OR: [{ dueDate: null }, { dueDate: { gte: startOfUtcDay(now) } }],
    },
    data: { deletedAt: now },
  });
}

/** Assure un lien coach↔athlète actif (source `group`) sans doublon. */
async function ensureGroupLink(
  tx: Prisma.TransactionClient,
  coachId: string,
  athleteId: string,
  groupId: string,
): Promise<void> {
  const link = await tx.coachAthleteLink.findFirst({
    where: { coachId, athleteId, source: 'group', endedAt: null },
    select: { id: true },
  });
  if (!link) {
    await tx.coachAthleteLink.create({
      data: { coachId, athleteId, source: 'group', groupId },
    });
  }
}

/** Termine le lien `group` si l'athlète n'a plus aucun groupe actif de ce coach. */
async function endLinkIfLastGroup(
  tx: Prisma.TransactionClient,
  coachId: string,
  athleteId: string,
  now: Date,
): Promise<void> {
  const stillActive = await tx.groupMember.count({
    where: { athleteId, leftAt: null, group: { coachId, deletedAt: null } },
  });
  if (stillActive === 0) {
    await tx.coachAthleteLink.updateMany({
      where: { coachId, athleteId, source: 'group', endedAt: null },
      data: { endedAt: now },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Ne conserve que les clés explicitement fournies (sémantique PATCH). */
function definedOnly<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as Partial<T>;
}

type GroupWithCount = Group & { _count: { members: number } };

function toGroupDto(group: Group | GroupWithCount, memberCount: number): GroupDto {
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? undefined,
    coachId: group.coachId,
    // Code masqué (null) si révoqué (ADR-16) ; sinon exposé au coach propriétaire.
    inviteCode: group.inviteCodeRevokedAt ? null : group.inviteCode,
    memberCount,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

type AthleteSummary = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  sport: string | null;
};

type MemberWithGroupAndCoach = {
  joinedAt: Date;
  group: Group & { coach: AthleteSummary; _count: { members: number } };
};

/** Mappe une appartenance active vers la vue athlète `AthleteGroup` (ADR-26). */
function toAthleteGroupDto(row: MemberWithGroupAndCoach): AthleteGroupDto {
  return {
    id: row.group.id,
    name: row.group.name,
    description: row.group.description ?? undefined,
    memberCount: row.group._count.members,
    joinedAt: row.joinedAt.toISOString(),
    coach: {
      id: row.group.coach.id,
      firstName: row.group.coach.firstName ?? undefined,
      lastName: row.group.coach.lastName ?? undefined,
      sport: row.group.coach.sport ?? undefined,
    },
  };
}

type MemberWithAthlete = {
  athleteId: string;
  groupId: string;
  joinedAt: Date;
  athlete?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    sport: string | null;
  } | null;
};

function toGroupMemberDto(member: MemberWithAthlete): GroupMemberDto {
  return {
    athleteId: member.athleteId,
    groupId: member.groupId,
    joinedAt: member.joinedAt.toISOString(),
    athlete: member.athlete
      ? {
          id: member.athlete.id,
          firstName: member.athlete.firstName ?? undefined,
          lastName: member.athlete.lastName ?? undefined,
          sport: member.athlete.sport ?? undefined,
        }
      : undefined,
  };
}

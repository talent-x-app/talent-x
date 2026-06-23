import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { GroupCreateDto } from './dto/group-create.dto';
import { GroupUpdateDto } from './dto/group-update.dto';
import { GroupDto, GroupPageDto } from './dto/group.dto';
import { GroupMemberDto, GroupMemberPageDto } from './dto/group-member.dto';
import { AthleteGroupListDto } from './dto/athlete-group.dto';
import { GroupTeammateListDto } from './dto/group-teammate.dto';
import { InviteCodeActionDto, InviteCodeDto } from './dto/invite-code.dto';
import { JoinGroupRequestDto } from './dto/join-group.dto';
import {
  AnnouncementCreateDto,
  AnnouncementReactionsDto,
  AnnouncementReadReceiptDto,
  GroupAnnouncementDto,
  GroupAnnouncementListDto,
} from './dto/announcement.dto';
import {
  AnnouncementReplyCreateDto,
  AnnouncementReplyDto,
  AnnouncementReplyListDto,
  ReplyReportDto,
} from './dto/announcement-reply.dto';
import { TeamPulseDto } from './dto/team-pulse.dto';
import { GroupsService } from './groups.service';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementRepliesService } from './announcement-replies.service';
import { TeamPulseService } from './team-pulse.service';

/**
 * Groupes (TLX-041). RBAC par endpoint (matrice TX-SPEC-002 §6) :
 * gestion (`groups.*`) réservée au **coach** (ownership vérifié dans le service) ;
 * `join`/`leave` réservés à l'**athlète**.
 */
@ApiTags('Groupes')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly announcements: AnnouncementsService,
    private readonly replies: AnnouncementRepliesService,
    private readonly teamPulse: TeamPulseService,
  ) {}

  @Post()
  @Roles('coach')
  @HttpCode(201)
  @ApiOperation({ summary: 'Créer un groupe', operationId: 'createGroup' })
  @ApiResponse({ status: 201, description: 'Groupe créé.', type: GroupDto })
  createGroup(@CurrentUser('id') coachId: string, @Body() dto: GroupCreateDto): Promise<GroupDto> {
    return this.groups.createGroup(coachId, dto);
  }

  @Get()
  @Roles('coach')
  @ApiOperation({ summary: 'Lister ses groupes', operationId: 'listGroups' })
  @ApiResponse({ status: 200, description: 'Liste paginée des groupes.', type: GroupPageDto })
  listGroups(
    @CurrentUser('id') coachId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<GroupPageDto> {
    return this.groups.listGroups(coachId, query);
  }

  @Post('join')
  @Roles('athlete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rejoindre un groupe via code', operationId: 'joinGroup' })
  @ApiResponse({ status: 200, description: 'Groupe rejoint.', type: GroupMemberDto })
  joinGroup(
    @CurrentUser('id') athleteId: string,
    @Body() dto: JoinGroupRequestDto,
  ): Promise<GroupMemberDto> {
    return this.groups.joinGroup(athleteId, dto.inviteCode);
  }

  @Get('mine')
  @Roles('athlete')
  @ApiOperation({
    summary: 'Lister ses groupes (athlète) et son coach',
    operationId: 'getMyGroups',
  })
  @ApiResponse({
    status: 200,
    description: "Groupes actifs de l'athlète.",
    type: AthleteGroupListDto,
  })
  getMyGroups(@CurrentUser('id') athleteId: string): Promise<AthleteGroupListDto> {
    return this.groups.listMyGroups(athleteId);
  }

  @Get(':id/teammates')
  @Roles('athlete')
  @ApiOperation({
    summary: 'Lister ses coéquipiers (athlète membre)',
    operationId: 'getGroupTeammates',
  })
  @ApiResponse({
    status: 200,
    description: 'Membres actifs du groupe (vue pair).',
    type: GroupTeammateListDto,
  })
  getGroupTeammates(
    @CurrentUser('id') athleteId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<GroupTeammateListDto> {
    return this.groups.listTeammates(athleteId, id);
  }

  @Get(':id')
  @Roles('coach')
  @ApiOperation({ summary: "Détail d'un groupe", operationId: 'getGroup' })
  @ApiResponse({ status: 200, description: 'Groupe.', type: GroupDto })
  getGroup(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<GroupDto> {
    return this.groups.getGroup(coachId, id);
  }

  @Put(':id')
  @Roles('coach')
  @ApiOperation({ summary: 'Modifier un groupe', operationId: 'updateGroup' })
  @ApiResponse({ status: 200, description: 'Groupe mis à jour.', type: GroupDto })
  updateGroup(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: GroupUpdateDto,
  ): Promise<GroupDto> {
    return this.groups.updateGroup(coachId, id, dto);
  }

  @Delete(':id')
  @Roles('coach')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer (logique) un groupe', operationId: 'deleteGroup' })
  @ApiResponse({ status: 204, description: 'Groupe supprimé.' })
  deleteGroup(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.groups.deleteGroup(coachId, id);
  }

  @Get(':id/members')
  @Roles('coach')
  @ApiOperation({ summary: 'Lister les membres', operationId: 'listGroupMembers' })
  @ApiResponse({ status: 200, description: 'Liste paginée des membres.', type: GroupMemberPageDto })
  listGroupMembers(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<GroupMemberPageDto> {
    return this.groups.listGroupMembers(coachId, id, query);
  }

  @Delete(':id/members/:athleteId')
  @Roles('coach')
  @HttpCode(204)
  @ApiOperation({ summary: 'Retirer un athlète du groupe', operationId: 'removeGroupMember' })
  @ApiResponse({ status: 204, description: 'Athlète retiré.' })
  removeGroupMember(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('athleteId', new ParseUUIDPipe()) athleteId: string,
  ): Promise<void> {
    return this.groups.removeGroupMember(coachId, id, athleteId);
  }

  @Post(':id/invite-code')
  @Roles('coach')
  @HttpCode(200)
  @ApiOperation({
    summary: "Régénérer ou révoquer le code d'invitation",
    operationId: 'manageInviteCode',
  })
  @ApiResponse({ status: 200, description: 'Nouveau code (ou code révoqué).', type: InviteCodeDto })
  manageInviteCode(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InviteCodeActionDto,
  ): Promise<InviteCodeDto> {
    return this.groups.manageInviteCode(coachId, id, dto.action);
  }

  @Post(':id/leave')
  @Roles('athlete')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quitter un groupe', operationId: 'leaveGroup' })
  @ApiResponse({ status: 204, description: 'Groupe quitté.' })
  leaveGroup(
    @CurrentUser('id') athleteId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.groups.leaveGroup(athleteId, id);
  }

  // --- Annonces de groupe (ADR-46) ---

  @Get(':id/announcements')
  @ApiOperation({ summary: 'Lister les annonces du groupe', operationId: 'listAnnouncements' })
  @ApiResponse({
    status: 200,
    description: 'Annonces (récentes d’abord).',
    type: GroupAnnouncementListDto,
  })
  listAnnouncements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<GroupAnnouncementListDto> {
    return this.announcements.listAnnouncements(user, id);
  }

  @Post(':id/announcements')
  @Roles('coach')
  @HttpCode(201)
  @ApiOperation({ summary: 'Publier une annonce', operationId: 'createAnnouncement' })
  @ApiResponse({ status: 201, description: 'Annonce publiée.', type: GroupAnnouncementDto })
  createAnnouncement(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AnnouncementCreateDto,
  ): Promise<GroupAnnouncementDto> {
    return this.announcements.createAnnouncement(coachId, id, dto);
  }

  @Delete(':id/announcements/:announcementId')
  @Roles('coach')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer une annonce', operationId: 'deleteAnnouncement' })
  @ApiResponse({ status: 204, description: 'Annonce supprimée.' })
  deleteAnnouncement(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<void> {
    return this.announcements.deleteAnnouncement(coachId, id, announcementId);
  }

  // --- Réactions emoji aux annonces (ADR-48, Palier 1) ---
  // RBAC = lecture du groupe (coach propriétaire OU membre actif) : pas de @Roles ici, la garde
  // fine est dans le service. Réponse = compteurs agrégés + emoji de l'appelant (jamais « qui »).

  @Put(':id/announcements/:announcementId/reactions/:emoji')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réagir à une annonce (emoji)', operationId: 'addAnnouncementReaction' })
  @ApiResponse({ status: 200, description: 'Réactions à jour.', type: AnnouncementReactionsDto })
  addAnnouncementReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @Param('emoji') emoji: string,
  ): Promise<AnnouncementReactionsDto> {
    return this.announcements.addReaction(user, id, announcementId, emoji);
  }

  @Delete(':id/announcements/:announcementId/reactions/:emoji')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Retirer sa réaction à une annonce',
    operationId: 'removeAnnouncementReaction',
  })
  @ApiResponse({ status: 200, description: 'Réactions à jour.', type: AnnouncementReactionsDto })
  removeAnnouncementReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @Param('emoji') emoji: string,
  ): Promise<AnnouncementReactionsDto> {
    return this.announcements.removeReaction(user, id, announcementId, emoji);
  }

  // --- Accusé de lecture agrégé (ADR-48, Palier 1) ---

  @Put(':id/announcements/:announcementId/read')
  @Roles('athlete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Marquer une annonce comme lue',
    operationId: 'markAnnouncementRead',
  })
  @ApiResponse({
    status: 200,
    description: 'Accusé de lecture agrégé à jour.',
    type: AnnouncementReadReceiptDto,
  })
  markAnnouncementRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<AnnouncementReadReceiptDto> {
    return this.announcements.markRead(user, id, announcementId);
  }

  // --- Fil de réponses sous annonce (ADR-48 Palier 3 / ADR-50) ---
  // RBAC = lecture/écriture du groupe (coach propriétaire OU membre actif), garde fine au service.
  // Fil bidirectionnel ; modération (suppression auteur/coach, signalement, masquage sur seuil).

  @Get(':id/announcements/:announcementId/replies')
  @ApiOperation({ summary: "Lister le fil d'une annonce", operationId: 'listAnnouncementReplies' })
  @ApiResponse({
    status: 200,
    description: 'Réponses (chronologique croissant).',
    type: AnnouncementReplyListDto,
  })
  listAnnouncementReplies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
  ): Promise<AnnouncementReplyListDto> {
    return this.replies.listReplies(user, id, announcementId);
  }

  @Post(':id/announcements/:announcementId/replies')
  @HttpCode(201)
  @ApiOperation({ summary: 'Répondre à une annonce', operationId: 'createAnnouncementReply' })
  @ApiResponse({ status: 201, description: 'Réponse publiée.', type: AnnouncementReplyDto })
  createAnnouncementReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @Body() dto: AnnouncementReplyCreateDto,
  ): Promise<AnnouncementReplyDto> {
    return this.replies.createReply(user, id, announcementId, dto);
  }

  @Delete(':id/announcements/:announcementId/replies/:replyId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Supprimer une réponse (auteur ou coach)',
    operationId: 'deleteAnnouncementReply',
  })
  @ApiResponse({ status: 204, description: 'Réponse supprimée.' })
  deleteAnnouncementReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @Param('replyId', new ParseUUIDPipe()) replyId: string,
  ): Promise<void> {
    return this.replies.deleteReply(user, id, announcementId, replyId);
  }

  @Post(':id/announcements/:announcementId/replies/:replyId/report')
  @HttpCode(200)
  @ApiOperation({ summary: 'Signaler une réponse', operationId: 'reportAnnouncementReply' })
  @ApiResponse({
    status: 200,
    description: 'Réponse à jour (signalée).',
    type: AnnouncementReplyDto,
  })
  reportAnnouncementReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @Param('replyId', new ParseUUIDPipe()) replyId: string,
    @Body() dto: ReplyReportDto,
  ): Promise<AnnouncementReplyDto> {
    return this.replies.reportReply(user, id, announcementId, replyId, dto.reason);
  }

  // --- Pouls d'équipe (ADR-48, Palier 1) — agrégat dérivé, RBAC = coach propriétaire ou membre ---

  @Get(':id/pulse')
  @ApiOperation({ summary: "Pouls d'équipe (agrégat dérivé)", operationId: 'getTeamPulse' })
  @ApiResponse({ status: 200, description: "Pouls d'équipe de la semaine.", type: TeamPulseDto })
  getTeamPulse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TeamPulseDto> {
    return this.teamPulse.getTeamPulse(user, id);
  }
}

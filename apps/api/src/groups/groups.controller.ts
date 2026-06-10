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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { GroupCreateDto } from './dto/group-create.dto';
import { GroupUpdateDto } from './dto/group-update.dto';
import { GroupDto, GroupPageDto } from './dto/group.dto';
import { GroupMemberDto, GroupMemberPageDto } from './dto/group-member.dto';
import { AthleteGroupListDto } from './dto/athlete-group.dto';
import { InviteCodeActionDto, InviteCodeDto } from './dto/invite-code.dto';
import { JoinGroupRequestDto } from './dto/join-group.dto';
import { GroupsService } from './groups.service';

/**
 * Groupes (TLX-041). RBAC par endpoint (matrice TX-SPEC-002 §6) :
 * gestion (`groups.*`) réservée au **coach** (ownership vérifié dans le service) ;
 * `join`/`leave` réservés à l'**athlète**.
 */
@ApiTags('Groupes')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

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
}

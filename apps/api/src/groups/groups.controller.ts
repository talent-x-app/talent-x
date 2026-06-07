import { Controller, Delete, Get, NotImplementedException, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Groupes — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; logique + RBAC/ownership livrés par les tickets dédiés (501).
 */
@ApiTags('Groupes')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  @Post()
  @ApiOperation({ summary: 'Créer un groupe', operationId: 'createGroup' })
  createGroup(): never {
    throw new NotImplementedException('createGroup');
  }

  @Get()
  @ApiOperation({ summary: 'Lister les groupes', operationId: 'listGroups' })
  listGroups(): never {
    throw new NotImplementedException('listGroups');
  }

  @Post('join')
  @ApiOperation({ summary: 'Rejoindre un groupe via code', operationId: 'joinGroup' })
  joinGroup(): never {
    throw new NotImplementedException('joinGroup');
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un groupe", operationId: 'getGroup' })
  getGroup(@Param('id') _id: string): never {
    throw new NotImplementedException('getGroup');
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un groupe', operationId: 'updateGroup' })
  updateGroup(@Param('id') _id: string): never {
    throw new NotImplementedException('updateGroup');
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un groupe', operationId: 'deleteGroup' })
  deleteGroup(@Param('id') _id: string): never {
    throw new NotImplementedException('deleteGroup');
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Lister les membres', operationId: 'listGroupMembers' })
  listGroupMembers(@Param('id') _id: string): never {
    throw new NotImplementedException('listGroupMembers');
  }

  @Delete(':id/members/:athleteId')
  @ApiOperation({ summary: 'Retirer un membre', operationId: 'removeGroupMember' })
  removeGroupMember(@Param('id') _id: string, @Param('athleteId') _athleteId: string): never {
    throw new NotImplementedException('removeGroupMember');
  }

  @Post(':id/invite-code')
  @ApiOperation({ summary: "Gérer le code d'invitation", operationId: 'manageInviteCode' })
  manageInviteCode(@Param('id') _id: string): never {
    throw new NotImplementedException('manageInviteCode');
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Quitter un groupe', operationId: 'leaveGroup' })
  leaveGroup(@Param('id') _id: string): never {
    throw new NotImplementedException('leaveGroup');
  }
}

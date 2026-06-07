import { Controller, Delete, Get, NotImplementedException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Collaboration (commentaires) — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; logique livrée par les tickets dédiés (501).
 */
@ApiTags('Collaboration')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  @Post()
  @ApiOperation({ summary: 'Créer un commentaire', operationId: 'createComment' })
  createComment(): never {
    throw new NotImplementedException('createComment');
  }

  @Get()
  @ApiOperation({ summary: 'Lister les commentaires', operationId: 'listComments' })
  listComments(): never {
    throw new NotImplementedException('listComments');
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un commentaire', operationId: 'deleteComment' })
  deleteComment(@Param('id') _id: string): never {
    throw new NotImplementedException('deleteComment');
  }
}

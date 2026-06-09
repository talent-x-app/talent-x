import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Corps de `POST /comments` — schéma `CommentCreate`. Renseigner **exactement une**
 * cible (`sessionId` OU `performanceId`) ; la règle « exactement une » est vérifiée
 * côté service (400 sinon), car class-validator n'exprime pas proprement le `oneOf`.
 */
export class CommentCreateDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Cible séance (exclusif avec performanceId).',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Cible performance (exclusif avec sessionId).',
  })
  @IsOptional()
  @IsUUID()
  performanceId?: string;

  @ApiProperty({ description: 'Contenu du commentaire.', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}

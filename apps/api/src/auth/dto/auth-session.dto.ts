import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.dto';
import { AuthTokensDto } from './auth-tokens.dto';

/** Réponse session — schéma `AuthSession` (AuthTokens + user). */
export class AuthSessionDto extends AuthTokensDto {
  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

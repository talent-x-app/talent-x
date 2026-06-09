import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Corps de `POST /groups/join` — schéma `JoinGroupRequest`. */
export class JoinGroupRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  inviteCode!: string;
}

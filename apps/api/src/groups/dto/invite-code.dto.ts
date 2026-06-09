import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const INVITE_CODE_ACTIONS = ['regenerate', 'revoke'] as const;
export type InviteCodeAction = (typeof INVITE_CODE_ACTIONS)[number];

/** Corps de `POST /groups/{id}/invite-code` — schéma `InviteCodeAction`. */
export class InviteCodeActionDto {
  @ApiProperty({ enum: INVITE_CODE_ACTIONS })
  @IsIn(INVITE_CODE_ACTIONS)
  action!: InviteCodeAction;
}

/** Réponse — schéma `InviteCode` (null après révocation, ADR-16). */
export class InviteCodeDto {
  @ApiProperty({ nullable: true, description: 'null après révocation.' })
  inviteCode!: string | null;
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorDto } from '../common/dto/error.dto';
import { AuthService } from './auth.service';
import { AuthSessionDto } from './dto/auth-session.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { LogoutRequestDto } from './dto/logout-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { ResetPasswordRequestDto } from './dto/reset-password-request.dto';
import { TwoFactorSetupDto } from './dto/two-factor-setup.dto';
import { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';

@ApiTags('Authentification')
@ApiResponse({ status: 422, description: 'Validation échouée.', type: ErrorDto })
@ApiResponse({ status: 429, description: 'Trop de requêtes.', type: ErrorDto })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un compte', operationId: 'register' })
  @ApiResponse({ status: 201, description: 'Compte créé.', type: AuthSessionDto })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé.', type: ErrorDto })
  register(@Body() dto: RegisterRequestDto): Promise<AuthSessionDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authentifier et délivrer les jetons', operationId: 'login' })
  @ApiResponse({ status: 200, description: 'Authentifié.', type: AuthSessionDto })
  @ApiResponse({ status: 401, description: 'Identifiants invalides.', type: ErrorDto })
  login(@Body() dto: LoginRequestDto): Promise<AuthSessionDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renouveler la session (rotation + détection de réutilisation)',
    operationId: 'refresh',
  })
  @ApiResponse({ status: 200, description: 'Nouveau couple de jetons.', type: AuthTokensDto })
  @ApiResponse({ status: 409, description: 'Réutilisation de jeton détectée.', type: ErrorDto })
  refresh(@Body() dto: RefreshRequestDto): Promise<AuthTokensDto> {
    return this.authService.refresh(dto);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer le refresh token courant', operationId: 'logout' })
  @ApiResponse({ status: 204, description: 'Session révoquée.' })
  @ApiResponse({ status: 401, description: 'Authentification requise.', type: ErrorDto })
  logout(
    @Body() dto: LogoutRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.authService.logout(dto, user);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer toutes les sessions', operationId: 'logoutAll' })
  @ApiResponse({ status: 204, description: 'Toutes les sessions ont été révoquées.' })
  @ApiResponse({ status: 401, description: 'Authentification requise.', type: ErrorDto })
  logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.authService.logoutAll(user);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Déclencher la réinitialisation (réponse neutre)',
    operationId: 'forgotPassword',
  })
  @ApiResponse({ status: 202, description: 'Demande prise en compte (réponse neutre).' })
  forgotPassword(@Body() dto: ForgotPasswordRequestDto): Promise<void> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Réinitialiser le mot de passe (token à usage unique)',
    operationId: 'resetPassword',
  })
  @ApiResponse({ status: 204, description: 'Mot de passe réinitialisé.' })
  resetPassword(@Body() dto: ResetPasswordRequestDto): Promise<void> {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Roles('coach')
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activer la 2FA TOTP (V2)', operationId: 'enable2fa' })
  @ApiResponse({ status: 200, description: 'Secret TOTP à provisionner.', type: TwoFactorSetupDto })
  @ApiResponse({ status: 403, description: 'Réservé aux comptes coach.', type: ErrorDto })
  enable2fa(@CurrentUser() user: AuthenticatedUser): Promise<TwoFactorSetupDto> {
    return this.authService.enable2fa(user);
  }

  @ApiBearerAuth()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Vérifier un code 2FA (V2)', operationId: 'verify2fa' })
  @ApiResponse({ status: 204, description: 'Code vérifié.' })
  verify2fa(
    @Body() dto: TwoFactorVerifyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.authService.verify2fa(dto, user);
  }
}

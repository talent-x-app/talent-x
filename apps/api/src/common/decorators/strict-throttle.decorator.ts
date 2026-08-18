import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const STRICT_THROTTLE_KEY = 'strictThrottle';

/**
 * Marque un handler comme route sensible au bruteforce (TLX-233) : le limiteur
 * « strict » (seuils resserrés — THROTTLE_STRICT_*) ne s'applique qu'aux routes
 * portant cette métadonnée. À poser sur la méthode du contrôleur (login,
 * register, forgot-password) — pas sur la classe.
 */
export const StrictThrottle = (): CustomDecorator => SetMetadata(STRICT_THROTTLE_KEY, true);

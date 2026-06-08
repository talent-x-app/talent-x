/**
 * Module du keystore RS256 (TLX-020). Global : `KeyService` est injectable
 * partout (signature en TLX-022, vérification dans le JwtAuthGuard) sans réimport.
 */
import { Global, Module } from '@nestjs/common';
import { KeyService } from './key.service';

@Global()
@Module({
  providers: [KeyService],
  exports: [KeyService],
})
export class KeysModule {}

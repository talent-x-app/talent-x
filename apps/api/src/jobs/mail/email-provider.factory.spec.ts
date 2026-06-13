import { createEmailProvider } from './email-provider.factory';
import { BrevoEmailProvider } from './brevo-email-provider';
import { LoggingEmailProvider } from '../email-provider';
import type { EnvGetter } from './email-config';

const getter =
  (env: Record<string, string>): EnvGetter =>
  (key) =>
    env[key];

describe('createEmailProvider (TLX-128)', () => {
  it('aucun credential → LoggingEmailProvider (dev/CI)', () => {
    expect(createEmailProvider(getter({}))).toBeInstanceOf(LoggingEmailProvider);
  });

  it('credentials présents → BrevoEmailProvider (envoi réel)', () => {
    const provider = createEmailProvider(
      getter({
        BREVO_API_KEY: 'xkeysib-abc',
        EMAIL_FROM_ADDRESS: 'no-reply@talent-x.example',
      }),
    );
    expect(provider).toBeInstanceOf(BrevoEmailProvider);
  });

  it('groupe partiel → LoggingEmailProvider (la validation d’env aura déjà refusé en prod)', () => {
    expect(createEmailProvider(getter({ BREVO_API_KEY: 'k' }))).toBeInstanceOf(
      LoggingEmailProvider,
    );
  });
});

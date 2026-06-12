import type { ConfigService } from '@nestjs/config';
import { EmailProcessor } from './email.processor';
import type { EmailMessage, EmailProvider } from './email-provider';

describe('EmailProcessor', () => {
  function make(appPublicUrl?: string) {
    const sent: EmailMessage[] = [];
    const provider = {
      send: jest.fn().mockImplementation((m: EmailMessage) => {
        sent.push(m);
        return Promise.resolve();
      }),
    } as unknown as EmailProvider;
    const config = {
      get: (key: string) => (key === 'APP_PUBLIC_URL' ? appPublicUrl : undefined),
    } as unknown as ConfigService;
    return { processor: new EmailProcessor(provider, config), provider, sent };
  }

  it('compose le mail de reset avec le lien (APP_PUBLIC_URL + token encodé) et envoie', async () => {
    const { processor, sent } = make('https://app.talent-x.example/');

    await processor.process({
      kind: 'password_reset',
      to: 'a@e.test',
      params: { token: 'tok en/+' },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('a@e.test');
    expect(sent[0].subject).toMatch(/réinitialisation/i);
    // Pas de double slash après le host (trailing slash retiré), token URL-encodé.
    expect(sent[0].text).toContain(
      'https://app.talent-x.example/reset-password?token=tok%20en%2F%2B',
    );
  });

  it('défaut dev (Expo web) si APP_PUBLIC_URL absent', async () => {
    const { processor, sent } = make(undefined);

    await processor.process({ kind: 'password_reset', to: 'a@e.test', params: { token: 't1' } });

    expect(sent[0].text).toContain('http://localhost:8081/reset-password?token=t1');
  });
});

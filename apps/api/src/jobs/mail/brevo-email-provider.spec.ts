import { BrevoEmailProvider, type FetchLike } from './brevo-email-provider';
import type { EmailConfig } from './email-config';
import type { EmailMessage } from '../email-provider';

const CONFIG: EmailConfig = {
  apiKey: 'xkeysib-secret',
  fromAddress: 'no-reply@talent-x.example',
  fromName: 'Talent-X',
};

const MESSAGE: EmailMessage = {
  to: 'athlete@example.test',
  subject: 'Réinitialisation de votre mot de passe Talent-X',
  text: 'Ouvrez ce lien : https://app.talent-x.example/reset-password?token=tok',
};

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

type Call = { url: string; init: Parameters<FetchLike>[1] };

function fakeFetch(response: { status: number; body?: string } | (() => never)): {
  fetchFn: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchFn: FetchLike = (url, init) => {
    calls.push({ url, init });
    if (typeof response === 'function') {
      return Promise.reject(new Error('ECONNREFUSED'));
    }
    const status = response.status;
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      text: () => Promise.resolve(response.body ?? ''),
    });
  };
  return { fetchFn, calls };
}

describe('BrevoEmailProvider (TLX-128)', () => {
  it('envoie sur l’API Brevo avec la clé, l’expéditeur et le contenu du message', async () => {
    const { fetchFn, calls } = fakeFetch({ status: 201, body: '{"messageId":"<1@brevo>"}' });

    await new BrevoEmailProvider(CONFIG, fetchFn).send(MESSAGE);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ENDPOINT);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['api-key']).toBe('xkeysib-secret');
    const body = JSON.parse(calls[0].init.body) as Record<string, unknown>;
    expect(body).toEqual({
      sender: { email: 'no-reply@talent-x.example', name: 'Talent-X' },
      to: [{ email: 'athlete@example.test' }],
      subject: MESSAGE.subject,
      textContent: MESSAGE.text,
    });
  });

  it('réponse 2xx → résout sans lever', async () => {
    const { fetchFn } = fakeFetch({ status: 200 });
    await expect(new BrevoEmailProvider(CONFIG, fetchFn).send(MESSAGE)).resolves.toBeUndefined();
  });

  it('réponse non 2xx → lève (BullMQ retente) avec le statut', async () => {
    const { fetchFn } = fakeFetch({ status: 401, body: '{"code":"unauthorized"}' });
    await expect(new BrevoEmailProvider(CONFIG, fetchFn).send(MESSAGE)).rejects.toThrow(/401/);
  });

  it('5xx (panne fournisseur transitoire) → lève pour relance', async () => {
    const { fetchFn } = fakeFetch({ status: 503 });
    await expect(new BrevoEmailProvider(CONFIG, fetchFn).send(MESSAGE)).rejects.toThrow(/503/);
  });

  it('panne réseau → lève (échec transitoire)', async () => {
    const { fetchFn } = fakeFetch(() => {
      throw new Error('unused');
    });
    await expect(new BrevoEmailProvider(CONFIG, fetchFn).send(MESSAGE)).rejects.toThrow(
      /injoignable/,
    );
  });
});

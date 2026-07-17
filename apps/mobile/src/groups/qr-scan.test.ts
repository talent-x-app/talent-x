import { extractInviteCode } from './qr-scan';

describe('extractInviteCode (TLX-188)', () => {
  it('accepte un code brut au format serveur (8 caractères A-Z2-9)', () => {
    expect(extractInviteCode('ABCD2345')).toBe('ABCD2345');
  });

  it('normalise la casse et les espaces', () => {
    expect(extractInviteCode('  abcd2345\n')).toBe('ABCD2345');
  });

  it('extrait le paramètre code d’un deep-link talentx://', () => {
    expect(extractInviteCode('talentx://join?code=WXYZ9876')).toBe('WXYZ9876');
  });

  it('extrait le paramètre code d’une URL https avec d’autres paramètres', () => {
    expect(extractInviteCode('https://talent-x.app/join?utm=qr&code=abcd2345')).toBe('ABCD2345');
  });

  it('rejette un QR étranger (texte quelconque)', () => {
    expect(extractInviteCode('https://example.com/menu-du-jour')).toBeNull();
  });

  it('rejette un code au mauvais format (0/1 ambigus, longueur)', () => {
    expect(extractInviteCode('ABCD0145')).toBeNull(); // 0 et 1 exclus du charset
    expect(extractInviteCode('ABC234')).toBeNull(); // trop court
    expect(extractInviteCode('ABCD23456')).toBeNull(); // trop long
  });

  it('rejette un payload vide', () => {
    expect(extractInviteCode('   ')).toBeNull();
  });
});

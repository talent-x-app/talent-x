import realData from '../../prisma/talent-x-sample-data.json';
import type { SampleData } from './sample-data.types';
import { validateSampleData } from './validate-sample-data';

function makeValid(): SampleData {
  return {
    users: [
      { key: 'c', email: 'c@x.dev', role: 'coach', firstName: 'C', lastName: 'Oach' },
      { key: 'a', email: 'a@x.dev', role: 'athlete', firstName: 'A', lastName: 'Thlete' },
    ],
    groups: [{ key: 'g', coach: 'c', name: 'G', inviteCode: 'INV', members: ['a'] }],
    sessions: [{ key: 's', coach: 'c', title: 'S', status: 'published', exercises: { items: [] } }],
    assignments: [{ key: 'as', session: 's', athlete: 'a', status: 'completed' }],
    performances: [{ assignment: 'as', athlete: 'a', rpe: 7, results: { items: [] } }],
    comments: [{ author: 'c', performance: 'as', body: 'ok' }],
  };
}

describe('validateSampleData', () => {
  it('accepte un jeu valide', () => {
    expect(() => validateSampleData(makeValid())).not.toThrow();
  });

  it('le jeu de données livré (talent-x-sample-data.json) est valide', () => {
    const data = realData as unknown as SampleData;
    expect(() => validateSampleData(data)).not.toThrow();
    expect(data.users.length).toBeGreaterThan(0);
  });

  it('rejette un email dupliqué', () => {
    const d = makeValid();
    d.users[1].email = 'c@x.dev';
    expect(() => validateSampleData(d)).toThrow(/email dupliqué/);
  });

  it('rejette un coach de groupe qui n’est pas coach', () => {
    const d = makeValid();
    d.groups![0].coach = 'a';
    expect(() => validateSampleData(d)).toThrow(/coach invalide/);
  });

  it('rejette une affectation vers une séance inconnue', () => {
    const d = makeValid();
    d.assignments![0].session = 'inconnue';
    expect(() => validateSampleData(d)).toThrow(/session inconnue/);
  });

  it('rejette un rpe hors bornes', () => {
    const d = makeValid();
    d.performances![0].rpe = 12;
    expect(() => validateSampleData(d)).toThrow(/rpe hors 1\.\.10/);
  });

  it('rejette un commentaire ciblant à la fois séance et performance', () => {
    const d = makeValid();
    d.comments![0] = { author: 'c', session: 's', performance: 'as', body: 'x' };
    expect(() => validateSampleData(d)).toThrow(/exactement une/);
  });
});

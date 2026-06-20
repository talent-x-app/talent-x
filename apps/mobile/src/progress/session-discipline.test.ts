import { sessionDiscipline, sessionExpectsPerformance } from './session-discipline';
import type { ExerciseNode } from '../sessions/exercises-doc';

/** Feuille minimale d'un type donné. */
function leaf(type: string, name = type): ExerciseNode {
  return { name, type, order: 0 } as unknown as ExerciseNode;
}

/** Groupe (ADR-27) portant des membres typés. */
function group(types: string[]): ExerciseNode {
  return {
    kind: 'group',
    name: 'Série',
    items: types.map((t, i) => ({ name: t, type: t, order: i })),
  } as unknown as ExerciseNode;
}

describe('sessionDiscipline (ADR-43 §2)', () => {
  it('renvoie « none » sans feuille typée', () => {
    expect(sessionDiscipline(undefined)).toBe('none');
    expect(sessionDiscipline([])).toBe('none');
    expect(sessionDiscipline([leaf('custom')])).toBe('none');
  });

  it('ignore échauffement / retour au calme (TLX-171)', () => {
    expect(sessionDiscipline([leaf('warmup'), leaf('cooldown')])).toBe('none');
    expect(sessionDiscipline([leaf('warmup'), leaf('sprint'), leaf('cooldown')])).toBe('sprint');
  });

  it('dérive la discipline d’une séance mono-famille', () => {
    expect(sessionDiscipline([leaf('sprint'), leaf('sprint')])).toBe('sprint');
    expect(sessionDiscipline([leaf('throws')])).toBe('throws');
  });

  it('replie interval→endurance, vertical_jumps→jumps, core→strength', () => {
    expect(sessionDiscipline([leaf('interval')])).toBe('endurance');
    expect(sessionDiscipline([leaf('vertical_jumps')])).toBe('jumps');
    expect(sessionDiscipline([leaf('core')])).toBe('strength');
  });

  it('retient la famille dominante (strictement majoritaire)', () => {
    expect(sessionDiscipline([leaf('sprint'), leaf('sprint'), leaf('endurance')])).toBe('sprint');
  });

  it('renvoie « mixed » à égalité en tête', () => {
    expect(sessionDiscipline([leaf('sprint'), leaf('endurance')])).toBe('mixed');
    expect(sessionDiscipline([leaf('sprint'), leaf('jumps'), leaf('custom')])).toBe('mixed');
  });

  it('aplatit les feuilles des groupes (ADR-27)', () => {
    expect(sessionDiscipline([group(['sprint', 'sprint'])])).toBe('sprint');
    expect(sessionDiscipline([group(['interval', 'interval'])])).toBe('endurance');
  });
});

describe('sessionExpectsPerformance (ADR-43 §3)', () => {
  it('faux sans bloc mesurable (vide, custom, phases seules)', () => {
    expect(sessionExpectsPerformance([])).toBe(false);
    expect(sessionExpectsPerformance([leaf('custom')])).toBe(false);
    expect(sessionExpectsPerformance([leaf('warmup'), leaf('cooldown')])).toBe(false);
  });

  it('vrai dès ≥ 1 feuille rattachée à une discipline (record)', () => {
    expect(sessionExpectsPerformance([leaf('sprint')])).toBe(true);
    expect(sessionExpectsPerformance([leaf('custom'), leaf('strength')])).toBe(true);
    expect(sessionExpectsPerformance([group(['jumps'])])).toBe(true);
  });
});

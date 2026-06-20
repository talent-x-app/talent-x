import { Feather } from '@expo/vector-icons';
import type { ThemeColors } from '@talent-x/design-tokens';
import type { DisciplineKey } from '../coach/discipline-assistants';
import type { SessionDiscipline } from '../progress/session-discipline';

/**
 * Habillage visuel d'une discipline dérivée (ADR-43 §2) : libellé court, **clé de token** couleur
 * (résolue via `useTheme().colors` au rendu — aucune valeur en dur, TLX-145) et icône Feather. Le
 * mapping famille → libellé/couleur vit ici (côté présentation), pas sur la séance.
 *
 * Le design system n'expose que 5 teintes sémantiques (accent/success/warning/danger/info) pour
 * 6 disciplines : **Lancers et Renforcement partagent `warning`**, l'icône les désambiguïse. Une
 * 6ᵉ couleur de discipline relèverait du design system (suivi).
 */
export interface DisciplineVisual {
  key: DisciplineKey | 'mixed';
  label: string;
  colorKey: keyof ThemeColors;
  icon: keyof typeof Feather.glyphMap;
}

const DISCIPLINE_VISUALS: Record<DisciplineKey, DisciplineVisual> = {
  sprint: { key: 'sprint', label: 'Sprint', colorKey: 'accent', icon: 'zap' },
  hurdles: { key: 'hurdles', label: 'Haies', colorKey: 'info', icon: 'bar-chart-2' },
  endurance: { key: 'endurance', label: 'Endurance', colorKey: 'success', icon: 'activity' },
  jumps: { key: 'jumps', label: 'Sauts', colorKey: 'danger', icon: 'trending-up' },
  throws: { key: 'throws', label: 'Lancers', colorKey: 'warning', icon: 'target' },
  strength: { key: 'strength', label: 'Muscu', colorKey: 'warning', icon: 'box' },
};

const MIXED_VISUAL: DisciplineVisual = {
  key: 'mixed',
  label: 'Mixte',
  colorKey: 'textSecondary',
  icon: 'layers',
};

/**
 * Visuel d'une discipline de séance, ou `null` pour `none` (séance non typée → ni pastille ni tag).
 */
export function disciplineVisual(discipline: SessionDiscipline): DisciplineVisual | null {
  if (discipline === 'none') return null;
  if (discipline === 'mixed') return MIXED_VISUAL;
  return DISCIPLINE_VISUALS[discipline];
}

/** Disciplines filtrables dans le calendrier (ordre d'affichage des chips). */
export const FILTERABLE_DISCIPLINES: DisciplineKey[] = [
  'sprint',
  'endurance',
  'jumps',
  'hurdles',
  'throws',
  'strength',
];

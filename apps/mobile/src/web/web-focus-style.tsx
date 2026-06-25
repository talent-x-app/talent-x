import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

/**
 * Style de focus **web uniquement**. react-native-web rend les champs en `<input>/<textarea>`,
 * qui héritent de l'outline de focus **par défaut du navigateur** (cadre noir disgracieux,
 * visible au simple clic souris). On le remplace par :
 *  - aucun outline au clic souris (propre) ;
 *  - un **anneau accent au `:focus-visible`** (navigation clavier) → accessibilité préservée.
 * No-op sur natif (iOS/Android). Injecté une fois, mis à jour si l'accent du thème change.
 */
export function WebFocusStyle(): null {
  const { colors } = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = globalThis.document;
    if (!doc) return;

    const id = 'tx-web-focus-style';
    let el = doc.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = doc.createElement('style');
      el.id = id;
      doc.head.appendChild(el);
    }
    el.textContent = [
      'input, textarea, select, [contenteditable] { outline: none; }',
      'input:focus-visible, textarea:focus-visible, select:focus-visible {',
      `  outline: 2px solid ${colors.accent};`,
      '  outline-offset: 1px;',
      '  border-radius: 8px;',
      '}',
    ].join('\n');
  }, [colors.accent]);

  return null;
}

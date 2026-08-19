/**
 * Page « nouveau mot de passe » du site public (TLX-234, ADR-57).
 *
 * C'est la destination du lien envoyé par email (`EmailProcessor.passwordResetMessage`
 * construit `${APP_PUBLIC_URL}/reset-password?token=…`). Elle doit fonctionner SANS
 * l'application installée : c'est un parcours de secours, l'utilisateur peut avoir changé
 * de téléphone ou ouvrir son mail depuis un ordinateur.
 *
 * Contraintes de l'ADR appliquées ici :
 *  - le jeton arrive en paramètre d'URL : on le lit, on le garde en mémoire, et on
 *    **nettoie l'URL** pour qu'il ne reste ni dans la barre d'adresse, ni dans l'historique,
 *    ni dans un référent ;
 *  - aucun script tiers, aucune analytics, aucune dépendance — ce fichier est servi tel quel ;
 *  - l'URL de l'API n'est jamais en dur : elle vient de `window.TALENTX_CONFIG` (injecté par
 *    Nginx en staging/production, par `scripts/serve.mjs` en local).
 */

const MIN_PASSWORD_LENGTH = 8;

/** Extrait le jeton de la query string. `null` si absent ou vide. */
export function extractToken(search) {
  const token = new URLSearchParams(search).get('token');
  return token && token.trim().length > 0 ? token : null;
}

/** Valide la saisie avant tout appel réseau. `null` = saisie acceptable. */
export function validatePasswords(password, confirmation) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (password !== confirmation) {
    return 'Les deux mots de passe ne correspondent pas.';
  }
  return null;
}

/**
 * Message d'erreur pour un statut de réponse. Un jeton invalide, déjà utilisé ou expiré
 * ressort en 400/422 : on les rend indistinguables côté texte, il n'y a rien à apprendre
 * de la différence et le message doit rester actionnable.
 */
export function messageForStatus(status) {
  if (status === 400 || status === 422) {
    return 'Ce lien est invalide, expiré ou déjà utilisé. Demande un nouvel email depuis l’application.';
  }
  if (status === 429) {
    return 'Trop de tentatives. Réessaie dans quelques minutes.';
  }
  return 'Le changement a échoué. Réessaie dans un instant.';
}

/** Base de l'API, injectée par le serveur. */
function apiBaseUrl() {
  const configured = globalThis.TALENTX_CONFIG?.apiBaseUrl;
  if (!configured) {
    throw new Error('Configuration absente : window.TALENTX_CONFIG.apiBaseUrl');
  }
  return configured.replace(/\/+$/, '');
}

/**
 * Retire la query string sans recharger la page ni ajouter d'entrée d'historique :
 * `replaceState` **remplace** l'entrée courante, si bien que le jeton disparaît aussi du
 * bouton « précédent ».
 */
function stripTokenFromUrl(win) {
  win.history.replaceState(null, '', win.location.pathname);
}

export function mountResetPasswordPage(doc, win) {
  const form = doc.querySelector('[data-testid="reset-form"]');
  const passwordField = doc.querySelector('[data-testid="password"]');
  const confirmField = doc.querySelector('[data-testid="confirm"]');
  const submitButton = doc.querySelector('[data-testid="submit"]');
  const message = doc.querySelector('[data-testid="message"]');

  const show = (text, variant) => {
    message.textContent = text;
    message.dataset.variant = variant;
    message.hidden = false;
  };

  const token = extractToken(win.location.search);
  // Retiré immédiatement, avant toute saisie : le jeton ne doit pas survivre dans l'URL
  // le temps que l'utilisateur remplisse le formulaire.
  stripTokenFromUrl(win);

  if (!token) {
    form.hidden = true;
    show(
      'Lien incomplet. Ouvre le lien reçu par email, ou demande un nouvel email depuis l’application.',
      'error',
    );
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const invalid = validatePasswords(passwordField.value, confirmField.value);
    if (invalid) {
      show(invalid, 'error');
      return;
    }

    submitButton.disabled = true;
    message.hidden = true;

    void (async () => {
      try {
        const response = await win.fetch(`${apiBaseUrl()}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Le contrat attend `newPassword` (cf. ResetPasswordRequest).
          body: JSON.stringify({ token, newPassword: passwordField.value }),
        });

        if (response.status === 204) {
          form.hidden = true;
          show(
            'Mot de passe changé. Reconnecte-toi dans l’application avec ton nouveau mot de passe.',
            'success',
          );
          return;
        }
        show(messageForStatus(response.status), 'error');
        submitButton.disabled = false;
      } catch {
        // Réseau injoignable : on ne distingue pas plus finement, l'action reste la même.
        show('Connexion impossible. Vérifie ta connexion et réessaie.', 'error');
        submitButton.disabled = false;
      }
    })();
  });
}

// Auto-montage hors test : le module est aussi importé par les tests, qui appellent
// `mountResetPasswordPage` sur un document qu'ils contrôlent.
if (typeof document !== 'undefined' && document.querySelector('[data-testid="reset-form"]')) {
  mountResetPasswordPage(document, window);
}

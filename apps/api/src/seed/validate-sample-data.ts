import type {
  AssignmentStatus,
  ConsentType,
  SampleData,
  SessionStatus,
  UserRole,
} from './sample-data.types';

const USER_ROLES: readonly UserRole[] = ['coach', 'athlete'];
const CONSENT_TYPES: readonly ConsentType[] = ['data_processing', 'coach_access', 'marketing'];
const SESSION_STATUSES: readonly SessionStatus[] = ['draft', 'published', 'archived'];
const ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  'assigned',
  'in_progress',
  'completed',
  'skipped',
];

/**
 * Valide l'intégrité référentielle et les énumérations du jeu de seed avant
 * insertion (fail-fast, mêmes invariants que la base — cf. TX-DATA-006). Lève une
 * erreur agrégée listant tous les problèmes ; renvoie les données si tout est bon.
 */
export function validateSampleData(data: SampleData): SampleData {
  const errors: string[] = [];

  // --- users ---
  const userKeys = new Set<string>();
  const userRoleByKey = new Map<string, UserRole>();
  const emails = new Set<string>();
  for (const u of data.users) {
    if (userKeys.has(u.key)) errors.push(`user.key dupliqué : ${u.key}`);
    userKeys.add(u.key);
    userRoleByKey.set(u.key, u.role);
    const email = u.email?.toLowerCase();
    if (!email) errors.push(`user ${u.key} : email manquant`);
    else if (emails.has(email)) errors.push(`email dupliqué : ${u.email}`);
    else emails.add(email);
    if (!USER_ROLES.includes(u.role)) errors.push(`user ${u.key} : role invalide "${u.role}"`);
  }

  const isUser = (key: string): boolean => userKeys.has(key);
  const isRole = (key: string, role: UserRole): boolean => userRoleByKey.get(key) === role;

  // --- consents ---
  for (const c of data.consents ?? []) {
    if (!isUser(c.user)) errors.push(`consent : user inconnu "${c.user}"`);
    if (!CONSENT_TYPES.includes(c.type)) errors.push(`consent : type invalide "${c.type}"`);
  }

  // --- groups ---
  const inviteCodes = new Set<string>();
  for (const g of data.groups ?? []) {
    if (inviteCodes.has(g.inviteCode)) errors.push(`inviteCode dupliqué : ${g.inviteCode}`);
    inviteCodes.add(g.inviteCode);
    if (!isRole(g.coach, 'coach')) errors.push(`group ${g.key} : coach invalide "${g.coach}"`);
    for (const m of g.members) {
      if (!isRole(m, 'athlete')) errors.push(`group ${g.key} : membre non-athlète "${m}"`);
    }
  }

  // --- sessions ---
  const sessionKeys = new Set<string>();
  for (const s of data.sessions ?? []) {
    if (sessionKeys.has(s.key)) errors.push(`session.key dupliqué : ${s.key}`);
    sessionKeys.add(s.key);
    if (!isRole(s.coach, 'coach')) errors.push(`session ${s.key} : coach invalide "${s.coach}"`);
    if (!SESSION_STATUSES.includes(s.status)) {
      errors.push(`session ${s.key} : status invalide "${s.status}"`);
    }
    if (!Array.isArray(s.exercises?.items))
      errors.push(`session ${s.key} : exercises.items manquant`);
  }

  // --- assignments ---
  const assignmentKeys = new Set<string>();
  for (const a of data.assignments ?? []) {
    if (assignmentKeys.has(a.key)) errors.push(`assignment.key dupliqué : ${a.key}`);
    assignmentKeys.add(a.key);
    if (!sessionKeys.has(a.session))
      errors.push(`assignment ${a.key} : session inconnue "${a.session}"`);
    if (!isRole(a.athlete, 'athlete')) {
      errors.push(`assignment ${a.key} : athlète invalide "${a.athlete}"`);
    }
    if (!ASSIGNMENT_STATUSES.includes(a.status)) {
      errors.push(`assignment ${a.key} : status invalide "${a.status}"`);
    }
  }

  // --- performances (1:1 avec une affectation) ---
  const performanceAssignments = new Set<string>();
  for (const p of data.performances ?? []) {
    if (!assignmentKeys.has(p.assignment)) {
      errors.push(`performance : affectation inconnue "${p.assignment}"`);
    }
    if (performanceAssignments.has(p.assignment)) {
      errors.push(`performance : plusieurs performances pour l'affectation "${p.assignment}"`);
    }
    performanceAssignments.add(p.assignment);
    if (!isRole(p.athlete, 'athlete')) {
      errors.push(`performance ${p.assignment} : athlète invalide "${p.athlete}"`);
    }
    if (p.rpe !== undefined && (!Number.isInteger(p.rpe) || p.rpe < 1 || p.rpe > 10)) {
      errors.push(`performance ${p.assignment} : rpe hors 1..10 (${p.rpe})`);
    }
    if (!Array.isArray(p.results?.items)) {
      errors.push(`performance ${p.assignment} : results.items manquant`);
    }
  }

  // --- comments (exactement une cible) ---
  for (const c of data.comments ?? []) {
    if (!isUser(c.author)) errors.push(`comment : auteur inconnu "${c.author}"`);
    const targets = [c.session, c.performance].filter((t) => t !== undefined);
    if (targets.length !== 1) {
      errors.push(`comment de ${c.author} : doit cibler exactement une séance OU une performance`);
    }
    if (c.session !== undefined && !sessionKeys.has(c.session)) {
      errors.push(`comment : séance inconnue "${c.session}"`);
    }
    if (c.performance !== undefined && !performanceAssignments.has(c.performance)) {
      errors.push(`comment : performance inconnue (affectation "${c.performance}")`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Jeu de données de seed invalide :\n- ${errors.join('\n- ')}`);
  }
  return data;
}

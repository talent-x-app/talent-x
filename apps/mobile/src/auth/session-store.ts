import { secureDelete, secureGet, secureSet } from './secure-storage';

export type UserRole = 'coach' | 'athlete';

const ROLE_KEY = 'talentx.userRole';

let cached: UserRole | null = null;

export async function loadRole(): Promise<UserRole | null> {
  const val = await secureGet(ROLE_KEY);
  cached = val === 'coach' || val === 'athlete' ? val : null;
  return cached;
}

export function getRole(): UserRole | null {
  return cached;
}

export async function setRole(role: UserRole): Promise<void> {
  cached = role;
  await secureSet(ROLE_KEY, role);
}

export async function clearRole(): Promise<void> {
  cached = null;
  await secureDelete(ROLE_KEY);
}

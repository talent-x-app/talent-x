import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearRole, loadRole, setRole, type UserRole } from './session-store';
import { clearTokens } from './token-store';

interface SessionState {
  role: UserRole | null;
  isLoading: boolean;
  signIn: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRole()
      .then(setRoleState)
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (r: UserRole) => {
    await setRole(r);
    setRoleState(r);
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all([clearTokens(), clearRole()]);
    setRoleState(null);
  }, []);

  return (
    <SessionContext.Provider value={{ role, isLoading, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

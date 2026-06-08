import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { setupApiClient } from '../data/setup';
import { restoreSession } from './auth';
import { clearRole, setRole, type UserRole } from './session-store';
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
    let active = true;
    void (async () => {
      // Configure le client + hydrate les jetons AVANT de restaurer la session
      // (refresh silencieux). `isLoading` reste vrai jusqu'à la fin : pas de
      // redirection avant que les jetons soient prêts (TLX-027).
      await setupApiClient();
      const restored = await restoreSession();
      if (active) {
        setRoleState(restored);
        setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
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

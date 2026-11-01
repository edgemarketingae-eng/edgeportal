import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CallTracker } from "../../modules/call-tracker";
import { API_URL, setExpiredHandler } from "./api";
import { clearLocalData } from "./outbox";

interface Session {
  signedIn: boolean;
  signIn(token: string): void;
  signOut(): void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState(() => !!CallTracker.token());

  const signOut = useCallback(() => {
    CallTracker.signOut();
    queryClient.clear(); // lead details shouldn't outlive the session on a shared or lost phone
    void clearLocalData();
    setSignedIn(false);
  }, [queryClient]);

  const signIn = useCallback((token: string) => {
    CallTracker.signIn(API_URL, token);
    setSignedIn(true);
  }, []);

  useEffect(() => setExpiredHandler(signOut), [signOut]);

  const value = useMemo(() => ({ signedIn, signIn, signOut }), [signedIn, signIn, signOut]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider");
  return session;
}

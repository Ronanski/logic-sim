// Authentication (Lovable Cloud): session state + helpers used by the auth pages.
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const RETURN_KEY = "auth-return-to";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoadingAuth(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setIsLoadingAuth(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoadingAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export async function loginWithGoogle(returnTo = "/") {
  sessionStorage.setItem(RETURN_KEY, returnTo);
  const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
  if (result.error) throw result.error;
  if (result.redirected) return;
  consumeReturnTo(true);
}

// After an OAuth round-trip, send the user to where they were headed.
export function consumeReturnTo(navigate = false) {
  const to = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  const safe = to && to.startsWith("/") && !to.startsWith("//") && !to.includes("\\") ? to : "/";
  if (navigate) window.location.href = safe;
  return to ? safe : null;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/login";
}

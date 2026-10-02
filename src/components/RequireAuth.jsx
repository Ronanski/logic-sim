import React, { useEffect } from "react";
import { useAuth, consumeReturnTo } from "@/lib/auth";

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

// Shows children only to signed-in users; otherwise sends them to /login (keeping returnTo).
export default function RequireAuth({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!isAuthenticated) {
      const here = window.location.pathname + window.location.search;
      window.location.replace("/login" + (here !== "/" ? "?returnTo=" + encodeURIComponent(here) : ""));
      return;
    }
    const back = consumeReturnTo();
    if (back && back !== window.location.pathname + window.location.search) window.location.replace(back);
  }, [isAuthenticated, isLoadingAuth]);

  if (isLoadingAuth || !isAuthenticated) return <Spinner />;
  return children;
}

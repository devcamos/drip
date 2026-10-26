"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type AuthScreen = "login" | "signup" | "recover" | "backup";
const screens = new Set<AuthScreen>(["login", "signup", "recover", "backup"]);
function currentScreen(): AuthScreen {
  const value = window.location.hash.slice(1) as AuthScreen;
  // Keep old bookmarks usable through the same login and recovery screens.
  if (window.location.hash === "#other") return "login";
  if (window.location.hash === "#other-recover") return "recover";
  return screens.has(value) ? value : "login";
}

export function useAuthScreen() {
  const [screen, setScreen] = useState<AuthScreen>("login");
  useEffect(() => {
    const update = () => setScreen(currentScreen());
    update(); window.addEventListener("popstate", update); window.addEventListener("hashchange", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("hashchange", update); };
  }, []);
  function navigate(next: AuthScreen) {
    window.history.pushState(null, "", `#${next}`);
    setScreen(next);
  }
  return { screen, navigate };
}

export function AuthLayout({ title, description, children }: Readonly<{ title: string; description: string; children: ReactNode }>) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [title]);
  return <main className="auth-page">
    <div className="auth-brand"><img src="/icon-192.png?v=drip-growth-1" alt="" width="44" height="44" /><span>Drip</span></div>
    <header className="auth-heading"><h1 ref={heading} tabIndex={-1}>{title}</h1><p className="muted">{description}</p></header>
    {children}
  </main>;
}

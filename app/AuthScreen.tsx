"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./AuthWelcome.module.css";

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

export function AuthLayout({ title, description, children, welcome = false }: Readonly<{ title: string; description: string; children: ReactNode; welcome?: boolean }>) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [title]);
  const form = <><header className="auth-heading"><h1 ref={heading} tabIndex={-1}>{title}</h1><p className="muted">{description}</p></header>{children}</>;
  return <main className={`auth-page${welcome ? ` ${s.page}` : ""}`}>
    <div className={`auth-brand${welcome ? ` ${s.brand}` : ""}`}><img src="/icon-192.png?v=drip-growth-1" alt="" width="44" height="44" /><span>Drip<span style={{color:"var(--accent-text)"}}>.</span></span></div>
    {welcome ? <div className={s.layout}>
      <div className={s.intro}><p className={s.eyebrow}>SMALL DROPS. A CLEARER PICTURE.</p><p className={s.statement}>Your money.<br className={s.desktopBreak} /> A little more<br className={s.desktopBreak} /> <em>in focus.</em></p><p className={s.description}>Savings, investments and credit cards. One clearer picture.</p>
        <div className={s.fan} aria-hidden="true"><div className={s.orbit}/><div className={s.back}/><div className={s.middle}/><div className={s.front}><span>↗</span><b>A clearer picture.</b><small>Every account has its place.</small></div></div>
        <p className={s.foot}>Little drops. Your bigger picture.</p>
      </div><div className={s.surface}>{form}</div>
    </div> : form}
  </main>;
}

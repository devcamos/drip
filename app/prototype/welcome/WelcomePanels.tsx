"use client";

import { useState } from "react";
import s from "./welcome.module.css";

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} /></svg>;
}

export function Brand() {
  return <div className={s.brand}><img src="/icon-192.png" alt="" width="44" height="44" /><span>Drip<span className={s.brandDot}>.</span></span></div>;
}

export function CardFan() {
  return <div className={s.fan} aria-hidden="true"><div className={s.fanOrbit} /><div className={s.fanBack}><span /><i /></div><div className={s.fanMiddle}><span /><i /></div><div className={s.fanFront}><span className={s.fanDrop}><svg viewBox="0 0 32 40" fill="none"><path d="M16 3C13 9 5 17 5 24a11 11 0 0 0 22 0c0-7-8-15-11-21Z" fill="currentColor" /><path d="M10 25a6 6 0 0 0 6 6" stroke="#fff9ee" strokeWidth="2" strokeLinecap="round" /></svg></span><span className={s.fanLines}><i /><i /></span><b>Room to grow.</b><small>Your next little earner</small></div><span className={s.fanSpark}><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M16 3v26M3 16h26M7 7l18 18M7 25 25 7" /></svg></span></div>;
}

export function SignInPreview({ onEnter, onNew }: { onEnter: () => void; onNew: () => void }) {
  const [recovery, setRecovery] = useState(false);
  return <section className={s.signinLayout} aria-label="Sign-in design">
    <div className={s.intro}><p className={s.eyebrow}>SMALL DROPS. A CLEARER PICTURE.</p><h1>Your money.<br /><span className={s.desktopSentence}> A little more<br /></span> <em>in focus.</em></h1><p className={s.introText}>Your savings, investments and the income they earn. All in one place.</p><div className={s.signinFan}><CardFan /></div><p className={s.introFoot}>Made for the way your money grows.</p></div>
    <div className={s.signinCard}>
      <span className={s.surfaceIcon} aria-hidden="true">↗</span>
      <p className={s.eyebrow}>YOUR LITTLE CORNER OF FINANCE</p>
      <h2>{recovery ? "Let’s get you back in." : "Welcome back."}</h2>
      <p className={s.formIntro}>{recovery ? "A clear route back to your accounts." : "Good to see you. Your accounts are waiting."}</p>
      {recovery ? <div className={s.recoveryPreview}><h3>Forgot your password?</h3><p>Try your saved password first, or use one of your original recovery codes.</p><p className={s.demoNote}>This is a design preview. No recovery code is needed here.</p><button className={s.primary} onClick={() => setRecovery(false)}>Back to demo sign-in <Arrow /></button></div> : <>
        <div className={s.field}><label htmlFor="preview-gamertag">Gamertag</label><input id="preview-gamertag" value="demo_grower" readOnly autoComplete="off" spellCheck={false} aria-describedby="preview-gamertag-hint" /><span id="preview-gamertag-hint">Your full gamertag, including any numbers.</span></div>
        <div className={s.passwordLabel}><label htmlFor="preview-password">Password</label><button className={s.textButton} onClick={() => setRecovery(true)}>Forgot password?</button></div>
        <input id="preview-password" className={s.passwordInput} value="" placeholder="••••••••••••" readOnly autoComplete="off" aria-describedby="demo-credentials" />
        <p id="demo-credentials" className={s.demoNote}>Sample sign-in. You won’t need a real password.</p>
        <button className={s.primary} onClick={onEnter}>Enter demo <Arrow /></button>
        <div className={s.newAccount}><span>New to Drip?</span><button className={s.textButton} onClick={onNew}>Preview a new account <Arrow diagonal /></button></div>
      </>}
    </div>
  </section>;
}

export function FirstAccountPreview({ onAdd, onExample }: { onAdd: () => void; onExample: () => void }) {
  return <section className={s.firstLayout} aria-label="First account design">
    <div className={s.firstCopy}><p className={s.eyebrow}>A FRESH START</p><h1>Your money,<br /> <em>taking shape.</em></h1><p>Start with one account. Add its balance and rate to see the income it could earn.</p><button className={s.primary} onClick={onAdd}>Add your first account <span aria-hidden="true">+</span></button><button className={s.exampleLink} onClick={onExample}>Take a look with sample accounts <Arrow /></button></div>
    <CardFan />
    <div className={s.firstSteps}><div><span>01</span><p><b>Bring your balances</b><small>Use the figures from your provider.</small></p></div><div><span>02</span><p><b>See the income</b><small>Keep estimates and received payments clear.</small></p></div><div><span>03</span><p><b>Make it yours</b><small>A colour and a place for every account.</small></p></div></div>
  </section>;
}

export function InstallPreview() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return <p className={s.setupDismissed} role="status">Install reminder hidden in this preview.</p>;
  return <div className={s.setup}><details><summary><span className={s.setupIcon} aria-hidden="true">↗</span><span><b>Make yourself at home</b><small>Add Drip to your Home Screen</small></span><span aria-hidden="true">+</span></summary><div className={s.setupContent}><p>On iPhone, tap Share, then Add to Home Screen. Installation gives you a shortcut to Drip.</p><p className={s.demoNote}>This preview doesn’t install the app or change your device.</p><button className={s.textButton} onClick={() => setDismissed(true)}>Not now</button></div></details></div>;
}

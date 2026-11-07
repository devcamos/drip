"use client";

import { useEffect, useRef, useState } from "react";
import { AccountPreview } from "./AccountPreview";
import { Arrow, Brand, FirstAccountPreview, InstallPreview, SignInPreview } from "./WelcomePanels";
import { addExample, portfolioSummary, samplePortfolio, updateCredit, updateStockPrice, type ExampleAccount, type IncomePeriod } from "./demo-accounts";
import ProfilePreview from "./ProfilePreview";
import FeedbackDialog from "../feedback/FeedbackDialog";
import s from "./welcome.module.css";

type Mode = "signin" | "first" | "accounts";
const modes: { id: Mode; label: string }[] = [{ id: "signin", label: "Sign in" }, { id: "first", label: "No accounts yet" }, { id: "accounts", label: "Your accounts" }];

function ExampleChooser({ adding, onChoose, onClose }: { adding: boolean; onChoose: (id: ExampleAccount) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className={s.chooser} aria-labelledby="example-chooser-heading" onCancel={onClose}><div className={s.sectionHeading}><span className={s.eyebrow}>{adding ? "ADD ANOTHER" : "CHOOSE AN EXAMPLE"}</span><button className={s.closeButton} onClick={onClose} aria-label="Close account chooser">×</button></div><h2 id="example-chooser-heading">What would you like to track?</h2><p>{adding ? "Each holding and credit card keeps its own figures. Add a sample to try it." : "Use the figures from your provider. Choose an example to explore."}</p><button className={s.choice} onClick={() => onChoose("cash")}><span className={s.choiceIcon}>£</span><span><b>Cash savings</b><small>{adding ? "Add another sample saver" : "View an easy-access saver example"}</small></span><Arrow /></button><button className={s.choice} onClick={() => onChoose("stock")}><span className={s.choiceIcon}>↗</span><span><b>Stocks & funds</b><small>{adding ? "Add another sample dividend holding" : "View a dividend holding example"}</small></span><Arrow /></button><button className={s.choice} onClick={() => onChoose("credit")}><span className={s.choiceIcon}>−</span><span><b>Credit card</b><small>{adding ? "Add another sample credit card" : "View an amount-owed example"}</small></span><Arrow /></button><p className={s.demoNote}>{adding ? "Samples last until reload or reset. No real account is created or connected." : "Sample data only. This won’t add or connect an account."}</p></dialog>;
}

export default function WelcomePrototype() {
  const [mode, setMode] = useState<Mode>("signin");
  const [selected, setSelected] = useState<string | null>(null);
  const [accounts, setAccounts] = useState(samplePortfolio);
  const [incomePeriod, setIncomePeriod] = useState<IncomePeriod>("month");
  const [profileOpen, setProfileOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const trigger = useRef<HTMLElement | null>(null);
  const productHeading = useRef<HTMLElement>(null);
  const feedbackTrigger = useRef<HTMLButtonElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  function navigate(next: Mode) { setMode(next); setSelected(null); setStockOpen(false); setChooser(false); setProfileOpen(false); setNotice(""); requestAnimationFrame(() => productHeading.current?.focus()); }
  function add() { trigger.current = document.activeElement as HTMLElement | null; setChooser(true); }
  function close() { const previous = trigger.current; setChooser(false); requestAnimationFrame(() => previous?.focus()); }
  function choose(kind: ExampleAccount) {
    const added = mode === "accounts" ? addExample(accounts, kind) : null;
    const account = added?.account ?? accounts.find(item => item.kind === kind)!;
    if (added) setAccounts(added.accounts);
    setChooser(false); setMode("accounts"); setSelected(account.id); setStockOpen(kind === "stock");
    setNotice(added ? `${account.name} added to this demo. Other accounts are unchanged. No real account was created.` : `Showing the ${kind === "cash" ? "cash saver" : kind === "stock" ? "dividend holding" : "credit card"} example. No account has been added.`);
    if (kind !== "stock") requestAnimationFrame(() => productHeading.current?.focus());
  }
  function reset() { navigate("signin"); setAccounts(samplePortfolio()); setIncomePeriod("month"); setFeedbackOpen(false); setRevision(value => value + 1); }
  function closeFeedback() { setFeedbackOpen(false); requestAnimationFrame(() => feedbackTrigger.current?.focus()); }
  function closeProfile() { setProfileOpen(false); requestAnimationFrame(() => profileTrigger.current?.focus()); }
  return <div className={s.page}>
    <div className={s.reviewBar}><div><b>First impressions</b><span>Interactive prototype · Sample data only</span></div><div className={s.modePicker} role="group" aria-label="Preview screen">{modes.map(item => <button key={item.id} aria-pressed={mode === item.id} onClick={() => navigate(item.id)}>{item.label}</button>)}</div><div className={s.reviewActions}><a href="/prototype/feedback">Feedback design</a><button className={s.reset} onClick={reset}>Reset demo</button></div></div>
    <div className={s.product} key={revision}>
      <header className={s.productHeader}><Brand />{mode !== "signin" ? <button ref={profileTrigger} className={s.avatarButton} aria-label="Open profile and settings" aria-haspopup="dialog" aria-controls="demo-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen(true)}>dg</button> : <span className={s.headerNote}>Your accounts, in one place.</span>}</header>
      <main className={s.main} ref={productHeading} tabIndex={-1}>
        {mode === "signin" ? <SignInPreview onEnter={() => navigate("accounts")} onNew={() => navigate("first")} /> : mode === "first" ? <FirstAccountPreview onAdd={add} onExample={() => navigate("accounts")} /> : <AccountPreview accounts={accounts} stockOpen={stockOpen} onStockOpen={setStockOpen} onStockPrice={(id, price) => setAccounts(previous => updateStockPrice(previous, id, price))} selected={selected} onSelect={setSelected} onAdd={add} incomePeriod={incomePeriod} onIncomePeriod={setIncomePeriod} onCreditChange={(id, card) => { setAccounts(previous => updateCredit(previous, id, card)); setNotice("Credit card figures updated in this demo. Other accounts are unchanged. No payment was made."); }} />}
        {mode !== "signin" ? <div className={s.setupWrap}><InstallPreview /></div> : null}
        <p role="status" className={s.notice}>{notice}</p>
      </main>
      <footer className={s.footer}><div><span>Little drops. Your bigger picture.</span><button ref={feedbackTrigger} className={s.feedbackLink} onClick={() => setFeedbackOpen(true)}>Give feedback</button></div><small>{mode === "signin" ? "Design preview · No real sign-in" : "Estimates before tax. Not financial advice."}</small></footer>
      <ProfilePreview open={profileOpen} counts={mode === "first" ? { cash: 0, stocks: 0, credits: 0 } : portfolioSummary(accounts)} incomePeriod={incomePeriod} onIncomePeriod={setIncomePeriod} onClose={closeProfile} onAccounts={() => navigate("accounts")} onFeedback={() => { setProfileOpen(false); setFeedbackOpen(true); }} onSignOut={() => navigate("signin")} />
      <FeedbackDialog open={feedbackOpen} onClose={closeFeedback} />
    </div>
    {chooser ? <ExampleChooser adding={mode === "accounts"} onClose={close} onChoose={choose} /> : null}
  </div>;
}

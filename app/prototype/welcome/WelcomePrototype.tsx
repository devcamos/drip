"use client";

import { useEffect, useRef, useState } from "react";
import { AccountPreview, type ExampleAccount } from "./AccountPreview";
import { Arrow, Brand, FirstAccountPreview, InstallPreview, SignInPreview } from "./WelcomePanels";
import { sampleCreditCard } from "./credit-card";
import type { CreditCard } from "./credit-card";
import type { StockPriceInput } from "./stock-valuation";
import FeedbackDialog from "../feedback/FeedbackDialog";
import s from "./welcome.module.css";

type Mode = "signin" | "first" | "accounts";
const modes: { id: Mode; label: string }[] = [{ id: "signin", label: "Sign in" }, { id: "first", label: "No accounts yet" }, { id: "accounts", label: "Your accounts" }];

function ExampleChooser({ onChoose, onClose }: { onChoose: (id: ExampleAccount) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className={s.chooser} aria-labelledby="example-chooser-heading" onCancel={onClose}><div className={s.sectionHeading}><span className={s.eyebrow}>START WITH ONE</span><button className={s.closeButton} onClick={onClose} aria-label="Close account chooser">×</button></div><h2 id="example-chooser-heading">What would you like to track?</h2><p>Use the figures from your provider. Choose an example to explore.</p><button className={s.choice} onClick={() => onChoose("cash")}><span className={s.choiceIcon}>£</span><span><b>Cash savings</b><small>View an easy-access saver example</small></span><Arrow /></button><button className={s.choice} onClick={() => onChoose("stock")}><span className={s.choiceIcon}>↗</span><span><b>Stocks & funds</b><small>View a dividend holding example</small></span><Arrow /></button><button className={s.choice} onClick={() => onChoose("credit")}><span className={s.choiceIcon}>−</span><span><b>Credit card</b><small>View an amount-owed example</small></span><Arrow /></button><p className={s.demoNote}>Sample data only. This won’t add or connect an account.</p></dialog>;
}

export default function WelcomePrototype() {
  const [mode, setMode] = useState<Mode>("signin");
  const [selected, setSelected] = useState<ExampleAccount | null>(null);
  const [creditCard, setCreditCard] = useState<CreditCard>(sampleCreditCard);
  const [stockPrice, setStockPrice] = useState<StockPriceInput | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const trigger = useRef<HTMLElement | null>(null);
  const productHeading = useRef<HTMLElement>(null);
  const feedbackTrigger = useRef<HTMLButtonElement>(null);
  function navigate(next: Mode) { setMode(next); setSelected(null); setStockOpen(false); setChooser(false); setNotice(""); requestAnimationFrame(() => productHeading.current?.focus()); }
  function add() { trigger.current = document.activeElement as HTMLElement | null; setChooser(true); }
  function close() { const previous = trigger.current; setChooser(false); requestAnimationFrame(() => previous?.focus()); }
  function choose(id: ExampleAccount) { setChooser(false); setMode("accounts"); setSelected(id); setStockOpen(id === "stock"); setNotice(`Showing the ${id === "cash" ? "cash saver" : id === "stock" ? "dividend holding" : "credit card"} example. No account has been added.`); if (id !== "stock") requestAnimationFrame(() => productHeading.current?.focus()); }
  function reset() { navigate("signin"); setCreditCard(sampleCreditCard()); setStockPrice(null); setFeedbackOpen(false); setRevision(value => value + 1); }
  function closeFeedback() { setFeedbackOpen(false); requestAnimationFrame(() => feedbackTrigger.current?.focus()); }
  return <div className={s.page}>
    <div className={s.reviewBar}><div><b>First impressions</b><span>Interactive prototype · Sample data only</span></div><div className={s.modePicker} role="group" aria-label="Preview screen">{modes.map(item => <button key={item.id} aria-pressed={mode === item.id} onClick={() => navigate(item.id)}>{item.label}</button>)}</div><div className={s.reviewActions}><a href="/prototype/feedback">Feedback design</a><button className={s.reset} onClick={reset}>Reset demo</button></div></div>
    <div className={s.product} key={revision}>
      <header className={s.productHeader}><Brand />{mode !== "signin" ? <button className={s.avatarButton} aria-label="Return to demo sign-in" onClick={() => navigate("signin")}>dg</button> : <span className={s.headerNote}>Your accounts, in one place.</span>}</header>
      <main className={s.main} ref={productHeading} tabIndex={-1}>
        {mode === "signin" ? <SignInPreview onEnter={() => navigate("accounts")} onNew={() => navigate("first")} /> : mode === "first" ? <FirstAccountPreview onAdd={add} onExample={() => navigate("accounts")} /> : <AccountPreview stockOpen={stockOpen} onStockOpen={setStockOpen} stockPrice={stockPrice} onStockPrice={setStockPrice} selected={selected} onSelect={setSelected} onAdd={add} creditCard={creditCard} onCreditChange={card => { setCreditCard(card); setNotice("Credit card figures updated in this demo. No payment was made."); }} />}
        {mode !== "signin" ? <div className={s.setupWrap}><InstallPreview /></div> : null}
        <p role="status" className={s.notice}>{notice}</p>
      </main>
      <footer className={s.footer}><div><span>Little drops. Your bigger picture.</span><button ref={feedbackTrigger} className={s.feedbackLink} onClick={() => setFeedbackOpen(true)}>Give feedback</button></div><small>{mode === "signin" ? "Design preview · No real sign-in" : "Estimates before tax. Not financial advice."}</small></footer>
      <FeedbackDialog open={feedbackOpen} onClose={closeFeedback} />
    </div>
    {chooser ? <ExampleChooser onClose={close} onChoose={choose} /> : null}
  </div>;
}

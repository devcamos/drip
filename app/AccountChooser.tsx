"use client";

import { useEffect, useRef } from "react";
import type { ProductCategory } from "@/lib/types";
import s from "./AccountChooser.module.css";

export function AccountChooser({ onChoose, onClose }: Readonly<{ onChoose: (category: ProductCategory) => void; onClose: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="account-chooser-title" onCancel={onClose}>
    <div className={s.heading}><span>YOUR NEXT ACCOUNT</span><button onClick={onClose} aria-label="Close account chooser">×</button></div>
    <h2 id="account-chooser-title">What would you like to track?</h2><p>Use the figures from your provider. Each account keeps its own balance and details.</p>
    <button className={s.choice} onClick={() => onChoose("easy-access")}><span aria-hidden="true">£</span><span><b>Cash savings</b><small>Savers, cash ISAs and other cash accounts</small></span><span aria-hidden="true">↗</span></button>
    <button className={s.choice} onClick={() => onChoose("stocks-funds")}><span aria-hidden="true">↗</span><span><b>Stocks &amp; funds</b><small>A dividend holding with shares and purchase cost</small></span><span aria-hidden="true">↗</span></button>
    <button className={s.choice} onClick={() => onChoose("credit-card")}><span aria-hidden="true">−</span><span><b>Credit card</b><small>An amount owed, APR and statement payment plan</small></span><span aria-hidden="true">↗</span></button>
  </dialog>;
}

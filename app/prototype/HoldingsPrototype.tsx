"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { annualIncome, demoHoldings, gbp, GRADIENTS, gradientStyle, totals, validateHolding } from "./holdings";
import type { Gradient, Holding } from "./holdings";
import s from "./prototype.module.css";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "m9 5 7 7-7 7"} /></svg>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={s.dialog} aria-label={title} onCancel={onClose} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, input, summary"))
      .filter(element => element.getClientRects().length > 0 && !element.hasAttribute("disabled"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className={s.dialogHeading}><h2>{title}</h2><button className={s.close} aria-label="Close dialog" onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}

function HoldingEditor({ holding, onSave, onClose }: { holding: Holding; onSave: (holding: Holding) => void; onClose: () => void }) {
  const [fields, setFields] = useState({ value: String(holding.value), yieldPct: String(holding.yieldPct), shares: String(holding.shares), averagePrice: String(holding.averagePrice) });
  const [error, setError] = useState<string | null>(null);
  const stock = holding.kind === "stock";
  const inputs = stock ? [["shares", "Number of shares"], ["averagePrice", "Average purchase price (£)"], ["value", "Current holding value (£)"], ["yieldPct", "Annual dividend yield (%)"]] : [["value", "Current balance (£)"], ["yieldPct", "Annual interest rate (%)"]];
  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateHolding(fields);
    if (problem) { setError(problem); return; }
    onSave({ ...holding, ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Number(value)])) });
  }
  return <Modal title={stock ? "Edit holding" : "Edit balance & rate"} onClose={onClose}>
    <p className={s.dialogIntro}>{holding.name} · {holding.provider}</p>
    <form onSubmit={submit} noValidate>
      <div className={s.formGrid}>{inputs.map(([key, label]) => <label key={key} className={s.field}>{label}<input inputMode="decimal" autoComplete="off" value={fields[key as keyof typeof fields]} onChange={event => setFields({ ...fields, [key]: event.target.value })} /></label>)}</div>
      <p className={s.helper}>Use your provider’s figures. {stock ? "Average price records what you paid; current value records what the holding is worth today." : "Drip estimates income from your saved balance and annual rate."}</p>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.modalActions}><button className={s.secondary} type="button" onClick={onClose}>Cancel</button><button className={s.primary} type="submit">Save changes</button></div>
    </form>
  </Modal>;
}

function ColourEditor({ holding, onSave, onClose }: { holding: Holding; onSave: (gradient: Gradient) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(holding.gradient);
  return <Modal title="Make it yours" onClose={onClose}>
    <p className={s.dialogIntro}>A little colour for {holding.name}.</p>
    <div className={s.colourPreview} style={gradientStyle(draft)}><span>{holding.name}</span><strong>{gbp(holding.value)}</strong><span className={s.previewCaption}>{draft.name} gradient</span></div>
    <fieldset className={s.swatches}><legend>Choose a gradient</legend>{GRADIENTS.map(gradient => <button key={gradient.name} type="button" aria-pressed={draft.name === gradient.name} className={s.swatch} onClick={() => setDraft(gradient)}><span style={gradientStyle(gradient)}>{draft.name === gradient.name && "✓"}</span>{gradient.name}</button>)}</fieldset>
    <details className={s.customColours}><summary>Create your own</summary><div className={s.formGrid}>{(["start", "end"] as const).map((key, i) => <label key={key} className={s.field}>{i === 0 ? "First colour" : "Second colour"}<input type="color" value={draft[key]} onChange={event => setDraft({ ...draft, name: "Custom", [key]: event.target.value })} /></label>)}</div></details>
    <div className={s.modalActions}><button className={s.secondary} onClick={onClose}>Cancel</button><button className={s.primary} onClick={() => onSave(draft)}>Apply gradient</button></div>
  </Modal>;
}

export default function HoldingsPrototype() {
  const [holdings, setHoldings] = useState(demoHoldings);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "stock" | "cash">("all");
  const [modal, setModal] = useState<"edit" | "colour" | null>(null);
  const modalTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (modal === null) modalTrigger.current?.focus(); }, [modal]);
  const [notice, setNotice] = useState("");
  const total = totals(holdings);
  const shown = holdings.filter(holding => filter === "all" || holding.kind === filter);
  const active = holdings.find(holding => holding.id === selected);
  const stockTotal = totals(holdings.filter(holding => holding.kind === "stock"));
  const cashTotal = total.value - stockTotal.value;

  function saveHolding(holding: Holding) {
    setHoldings(previous => previous.map(item => item.id === holding.id ? holding : item));
    setModal(null);
    setNotice(`${holding.name} updated in this preview.`);
  }

  function reset() {
    setHoldings(demoHoldings()); setSelected(null); setFilter("all"); setModal(null); setNotice("Sample holdings reset.");
  }

  return <div className={s.page}>
    <header className={s.header}>
      <a className={s.brand} href="/prototype" aria-label="Drip prototype home"><img src="/icon-192.png" width="38" height="38" alt="" /><span>Drip<span className={s.brandDot}>.</span></span></a>
      <div className={s.headerRight}><span className={s.labBadge}><span />Design preview</span><button className={s.reset} onClick={reset}>Reset demo</button></div>
    </header>

    <main className={s.main}>
      <div className={s.intro}><div><p className={s.eyebrow}>YOUR MONEY, AT A GLANCE</p><h1>Your accounts<span>.</span></h1><p className={s.subtitle}>A growing collection of little earners.</p></div><span className={s.sampleLabel}>Sample data · GBP</span></div>
      <section className={s.overview} aria-label="Portfolio summary">
        <div><span className={s.overviewLabel}>Total value</span><p className={s.total}>{gbp(total.value)}</p><span className={s.overviewFoot}>{holdings.length} accounts, one clear picture</span></div>
        <div className={s.incomeChip}><span className={s.incomeIcon}><Arrow diagonal /></span><div><span>Estimated monthly income</span><strong>{gbp(total.income / 12)}<small> / month</small></strong></div></div>
      </section>

      <div className={s.workspace}>
        <section className={s.wallet} aria-labelledby="wallet-title">
          <div className={s.walletHeading}><h2 id="wallet-title">Your stack <span>{shown.length}</span></h2><span className={s.tapHint}>Tap a card to unfold</span></div>
          <div className={s.filters} role="group" aria-label="Filter accounts">{([["all", "All accounts"], ["stock", "Stocks"], ["cash", "Cash"]] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setSelected(null); setNotice(""); }}>{label}</button>)}</div>

          <div className={s.deck} role="region" aria-label="Stacked account cards" tabIndex={0}>
            {shown.map((holding, index) => {
              const open = selected === holding.id;
              const stock = holding.kind === "stock";
              const cost = holding.shares * holding.averagePrice;
              return <article key={holding.id} className={`${s.card} ${open ? s.cardOpen : ""}`} style={{ ...gradientStyle(holding.gradient), "--tilt": `${index % 2 === 0 ? -.8 : .8}deg` } as CSSProperties} data-gradient={holding.gradient.name}>
                <button className={s.cardTrigger} aria-label={`${holding.name}, ${gbp(holding.value)}`} aria-expanded={open} aria-controls={`details-${holding.id}`} onClick={() => { setSelected(open ? null : holding.id); setNotice(""); }}>
                  <span className={s.cardName}>{holding.name}</span><span className={s.cardBalance}>{gbp(holding.value)}</span>
                </button>
                <div id={`details-${holding.id}`} hidden={!open} className={s.cardDetails}>
                  <div className={s.cardMeta}><span>{holding.provider}{holding.ticker ? ` · ${holding.ticker}` : ""}</span><span className={s.cardTag}>{stock ? "Dividends" : "Interest"}</span></div>
                  <dl className={s.stats}>
                    {stock && <><div><dt>Average price</dt><dd>{gbp(holding.averagePrice)}</dd></div><div><dt>Shares</dt><dd>{new Intl.NumberFormat("en-GB", { maximumFractionDigits: 8 }).format(holding.shares)}</dd></div></>}
                    <div><dt>{stock ? "Holding value" : "Balance"}</dt><dd>{gbp(holding.value)}</dd></div><div><dt>{stock ? "Dividend yield" : "Annual rate"}</dt><dd>{holding.yieldPct.toFixed(2)}%</dd></div>
                  </dl>
                  <div className={s.cardIncome}><div><span>Estimated annual {stock ? "dividends" : "interest"}</span><strong>{gbp(annualIncome(holding))}</strong></div><span className={s.incomePill}>≈ {gbp(annualIncome(holding) / 12)} / mo</span></div>
                  {stock && <p className={s.costBasis}>Purchase cost <b>{gbp(cost)}</b><span>Shares × average price</span></p>}
                  <div className={s.cardActions}><button onClick={event => { modalTrigger.current = event.currentTarget; setModal("edit"); }}>{stock ? "Edit holding" : "Edit balance & rate"}<Arrow /></button><button aria-label={`Change colour for ${holding.name}`} onClick={event => { modalTrigger.current = event.currentTarget; setModal("colour"); }}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" /></svg>Colour</button></div>
                </div>
              </article>;
            })}
          </div>
          <p className={s.deckFoot}>Your balances. Your colours. Your little corner of finance.</p>
        </section>

        <aside className={s.aside}>
          <section className={s.incomePanel} aria-labelledby="income-title"><div className={s.panelTop}><span className={s.smallIcon}>↗</span><span className={s.eyebrow}>INCOME OUTLOOK</span></div><h2 id="income-title">Watch the drops add up.</h2><p className={s.yearIncome}>{gbp(total.income)}<span>estimated per year</span></p><div className={s.incomeRows}><div><span><i className={s.stockDot} />Dividends</span><b>{gbp(stockTotal.income)}</b></div><div><span><i className={s.cashDot} />Interest</span><b>{gbp(total.income - stockTotal.income)}</b></div></div><p className={s.estimateNote}>Estimates use your saved values and annual rates. Monthly figures are yearly estimates ÷ 12, rather than a payout schedule. Rates and dividends can change.</p></section>
          <section className={s.mixPanel} aria-label="Portfolio mix"><h2>A balanced view</h2><div className={s.mixBar}><span style={{ width: `${total.value ? stockTotal.value / total.value * 100 : 0}%` }} /></div><div className={s.mixLabels}><div><span>Stocks / funds</span><b>{gbp(stockTotal.value)}</b></div><div><span>Cash</span><b>{gbp(cashTotal)}</b></div></div></section>
          <div className={s.designNote}><span aria-hidden="true">✳</span><p><b>A fresh coat of colour.</b>Open a card to try six gradients, or mix your own.</p></div>
        </aside>
      </div>
      <p role="status" className={s.notice}>{notice}</p>
      <footer className={s.footer}><span>Made for the way your money grows.</span><span>Interactive prototype · Changes reset on reload</span></footer>
    </main>
    {modal === "edit" && active && <HoldingEditor holding={active} onSave={saveHolding} onClose={() => setModal(null)} />}
    {modal === "colour" && active && <ColourEditor holding={active} onSave={gradient => saveHolding({ ...active, gradient })} onClose={() => setModal(null)} />}
  </div>;
}

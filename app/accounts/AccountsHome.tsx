"use client";

import type { Account } from "@/lib/types";
import { formatTag, type Identity } from "@/lib/identity";
import { accountCardStyle } from "@/lib/account-colour";
import { gbp } from "@/lib/maths";
import { displayProvider, productLabel } from "@/lib/products";
import { accountDate, accountTitle, calendarParts, groupAccounts, type AccountsTotals, type CreditPlan, type IncomePeriod, type NextAccountPayment } from "./presentation";
import s from "./accounts.module.css";

export type AccountsHomeProps = Readonly<{
  accounts: Account[];
  identity?: Identity;
  totals: AccountsTotals;
  creditPlans: readonly CreditPlan[];
  incomePeriod: IncomePeriod;
  onIncomePeriod: (period: IncomePeriod) => void;
  onAdd: () => void;
  onOpen: (id: string) => void;
  onPortfolio: () => void;
  receivedThisMonth?: number;
  nextPayment?: NextAccountPayment | null;
  preferenceBusy?: boolean;
  estimatedValues?: boolean;
}>;

export function AccountsHome({ accounts, identity, totals, creditPlans, incomePeriod, onIncomePeriod, onAdd, onOpen, onPortfolio, receivedThisMonth, nextPayment, preferenceBusy = false, estimatedValues = false }: AccountsHomeProps) {
  const accountIds = new Set(accounts.map(account => account.id));
  const plans = creditPlans.filter(plan => accountIds.has(plan.accountId));
  const debts = new Map(plans.map(plan => [plan.accountId, plan]));
  const assets = accounts.filter(account => !debts.has(account.id));
  const stockCount = assets.filter(account => account.rateType === "dividend").length;
  const groups = groupAccounts(accounts);
  const dateParts = nextPayment ? calendarParts(nextPayment.date) : null;
  if (!accounts.length) return <section className={`${s.experience} ${s.emptyState}`} aria-label="Your accounts are empty">
    <div className={s.emptyCopy}><p className={s.eyebrow}>YOUR ACCOUNTS</p><h1>Your money,<br /><em>taking shape.</em></h1><p>Your account list is empty. Add savings, an investment or a credit card to start seeing the picture.</p><button className={s.primary} onClick={onAdd}>Add an account <span aria-hidden="true">+</span></button><small>Use the figures from your provider. You can add more accounts at any time.</small></div>
    <div className={s.emptyCards} aria-hidden="true"><span>Cash savings</span><span>Stocks &amp; funds</span><span>Credit cards</span></div>
  </section>;
  return <section className={s.experience} aria-label="Your saved accounts">
    <header className={s.accountsHeading}><div><p className={s.eyebrow}>{identity ? `HELLO, ${formatTag(identity)}` : "YOUR ACCOUNTS"}</p><h1>A little more <em>perspective.</em></h1></div><span className={s.currencyPill}>Your accounts · GBP</span></header>
    <div className={s.overview}>
      <section className={s.balanceHero} aria-label="Money overview"><div className={s.heroTop}><span>Money</span><span className={s.heroMark} aria-hidden="true">↗</span></div><p>{gbp(totals.money)}</p><dl className={s.financialBreakdown}><div><dt>Credit card debt</dt><dd>{gbp(totals.debt)}</dd></div><div><dt>Net position</dt><dd>{gbp(totals.netPosition)}</dd></div></dl><small className={s.netNote}>Your assets and credit card debt in one view.</small><div className={s.balanceFoot}><span><i />{assets.length} asset {assets.length === 1 ? "account" : "accounts"} + {plans.length} credit {plans.length === 1 ? "card" : "cards"}</span><span>{estimatedValues ? "Includes a market estimate" : "Recorded values"}</span></div></section>
      <section className={s.incomeHero} aria-label="Estimated income"><p className={s.eyebrow}>YOUR INCOME OUTLOOK</p><h2>{gbp(incomePeriod === "month" ? totals.monthlyIncome : totals.annualIncome)}<span> / {incomePeriod === "month" ? "month" : "year"}</span></h2><p>{incomePeriod === "month" ? "Estimated monthly average" : "Estimated annual income"}</p><div className={s.periodPicker} role="group" aria-label="Estimate period"><button disabled={preferenceBusy} aria-pressed={incomePeriod === "month"} onClick={() => onIncomePeriod("month")}>Monthly</button><button disabled={preferenceBusy} aria-pressed={incomePeriod === "year"} onClick={() => onIncomePeriod("year")}>Yearly</button></div><small>Savings and investment income estimates. Payment amounts and dates can vary.</small></section>
    </div>
    <div className={s.accountsLayout}>
      <section className={s.wallet} aria-labelledby="saved-accounts-title"><div className={s.sectionHeading}><h2 id="saved-accounts-title">Your accounts <span>{String(accounts.length).padStart(2, "0")}</span></h2><button className={s.addSmall} onClick={onAdd} aria-label="Add an account">+</button></div><p id="saved-wallet-hint" className={s.sectionIntro}>Open a group to explore your accounts. Tap a card for details.</p><div className={s.cardStack} role="region" aria-label="Account cards" aria-describedby="saved-wallet-hint" tabIndex={0}>
        {groups.map(group => <details className={s.accountGroup} key={group.key} open><summary className={s.groupHeading}><span><b>{group.label}</b><small>{group.accounts.length} {group.accounts.length === 1 ? "account" : "accounts"}</small></span><strong>{gbp(group.total)}{group.key === "debt" ? " owed" : ""}</strong></summary><div className={s.groupCards}>
        {group.accounts.map(account => {
          const plan = debts.get(account.id), title = accountTitle(account), provider = displayProvider(account.provider);
          return <button key={account.id} className={`${s.accountCard} card`} style={accountCardStyle(account.colour)} onClick={() => onOpen(account.id)} aria-label={`Open ${title}, ${gbp(account.balance)}${plan ? " owed" : ""}${provider && provider !== title ? `, ${provider}` : ""}`}>
            <span className={s.providerMark} aria-hidden="true">{title[0] || "£"}</span><span className={s.cardTitle}>{title}<small>{provider && provider !== title ? `${provider} · ` : ""}{plan ? "Credit card · Repayments" : productLabel(account)}{account.label && account.label !== title ? ` · ${account.label}` : ""}</small></span><span className={s.cardValue}>{gbp(account.balance)}<small>{plan ? "owed" : "View account +"}</small></span>
          </button>;
        })}</div></details>)}
      </div><p className={s.walletFoot}>Your balances. Your colours. Your corner of finance.</p>{stockCount > 0 ? <button className={s.portfolioLink} onClick={onPortfolio}><span><b>Dividend portfolio</b><small>See your total dividend income</small></span><span aria-hidden="true">↗</span></button> : null}</section>
      <aside className={s.accountAside}>
        {plans.map(plan => <section key={plan.accountId} className={s.paymentPlan} aria-label={`${plan.name} payment plan`}><div className={s.sectionHeading}><h2>Your payment plan</h2><span className={s.debtPill}>CREDIT CARD</span></div><p className={s.paymentDue}>{plan.name} · Due {accountDate(plan.paymentDate)}</p><dl className={s.repaymentNumbers}><div><dt>Minimum payment due</dt><dd>{gbp(plan.minimumPayment)}</dd></div><div><dt>Planned payment</dt><dd>{plan.plannedPayment === undefined ? "Not set" : gbp(plan.plannedPayment)}</dd></div></dl><p>APR {plan.apr}%. Your plan doesn’t change the amount owed or schedule a payment.</p><button className={s.textLink} onClick={() => onOpen(plan.accountId)}>View credit card <span aria-hidden="true">↗</span></button></section>)}
        {nextPayment ? <section className={s.nextPayment} aria-label="Next expected payment"><div className={s.sectionHeading}><h2>Next little drop</h2><span className={s.tinyEyebrow}>EXPECTED</span></div><button className={s.paymentRow} onClick={() => onOpen(nextPayment.accountId)}>{dateParts ? <span className={s.calendarDate}>{dateParts.month}<b>{dateParts.day}</b></span> : null}<span><b>{nextPayment.name}</b><small>{accountDate(nextPayment.date)}</small></span><strong>{gbp(nextPayment.amount)}</strong></button><p>Based on the payment date you record. It isn’t a confirmed payment.</p></section> : null}
        {receivedThisMonth !== undefined ? <section className={s.received} aria-label="Received income"><div><span className={s.eyebrow}>RECEIVED THIS MONTH</span><strong>{gbp(receivedThisMonth)}</strong></div><span className={s.receivedIcon} aria-hidden="true">↓</span><p>Based on payments you log. Received income stays separate from your estimates.</p></section> : null}
      </aside>
    </div>
  </section>;
}

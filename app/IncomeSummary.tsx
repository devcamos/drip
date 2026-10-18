import type { Account } from "@/lib/types";
import * as M from "@/lib/maths";

export function IncomeSummary({ accounts }: Readonly<{ accounts: Account[] }>) {
  const today = M.ymd(new Date());
  const previous = M.addMonths(today.slice(0, 7) + "-01", -1).slice(0, 7);
  return <section className="panel" aria-label="Recorded income summary">
    <h2 style={{ marginTop: 0 }}>Recorded income</h2>
    <div className="grid">
      <div className="stat"><div className="muted">Received this month</div><div className="v">{M.gbp(M.recordedIncome(accounts, today.slice(0, 7)))}</div></div>
      <div className="stat"><div className="muted">Received last month</div><div className="v">{M.gbp(M.recordedIncome(accounts, previous))}</div></div>
      <div className="stat"><div className="muted">Received all time</div><div className="v">{M.gbp(M.recordedIncome(accounts))}</div></div>
      <div className="stat"><div className="muted">Pending bonuses</div><div className="v">{M.gbp(M.pendingBonuses(accounts))}</div></div>
    </div>
    <p className="muted">Based on payments you log. Pending bonuses and balance updates aren&apos;t counted as received income.</p>
  </section>;
}

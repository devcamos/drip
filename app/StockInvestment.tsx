"use client";
import type { Account } from "@/lib/types";
import { averagePriceLabel, formatShares, investmentReturn, type InvestmentInputs } from "@/lib/stock-investment";
import { gbp } from "@/lib/maths";

export function StockInvestmentFields({ value, onChange, disabled }: Readonly<{ value: InvestmentInputs; onChange: (value: InvestmentInputs) => void; disabled: boolean }>) {
  return <fieldset className="panel investment-fields" disabled={disabled}><legend>Investment details (optional)</legend>
    <label className="check-label"><input type="checkbox" checked={value.enabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} />Track shares and average price</label>
    {value.enabled && <>
      <div className="grid"><div><label htmlFor="investment-shares">Number of shares</label><input id="investment-shares" inputMode="decimal" value={value.shares} onChange={e => onChange({ ...value, shares: e.target.value })} placeholder="27.25750597" /></div>
        <div><label htmlFor="investment-average-gbp">Average purchase price per share (£)</label><input id="investment-average-gbp" inputMode="decimal" value={value.averagePriceGBP} onChange={e => onChange({ ...value, averagePriceGBP: e.target.value })} placeholder="44.99" /></div></div>
      <label htmlFor="investment-currency">Original price currency</label><select id="investment-currency" value={value.currency} onChange={e => onChange({ ...value, currency: e.target.value as InvestmentInputs["currency"] })}><option value="GBP">GBP (£) only</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option></select>
      {value.currency !== "GBP" && <><label htmlFor="investment-original-price">Average purchase price per share ({value.currency})</label><input id="investment-original-price" inputMode="decimal" value={value.originalPrice} onChange={e => onChange({ ...value, originalPrice: e.target.value })} placeholder="60.41" /><p className="muted">Enter the GBP equivalent from your provider above. Drip doesn&apos;t fetch or convert exchange rates.</p></>}
      <p className="muted">Fractional shares are supported. Keep current value separate: shares × average GBP price is your estimated cost, not today&apos;s value.</p>
    </>}
  </fieldset>;
}
export function StockInvestmentSummary({ account, onEdit }: Readonly<{ account: Account; onEdit: () => void }>) {
  const result = investmentReturn(account);
  const investment = account.investment;
  return <section className="panel investment-summary" aria-label="Your investment"><div className="row"><h2>Your investment</h2><button type="button" className="btn ghost small" onClick={onEdit}>{investment ? "Edit details" : "Add details"}</button></div>
    <dl className="investment-stats">
      <div><dt>Value</dt><dd>{gbp(account.balance)}</dd></div>
      <div><dt>Estimated return</dt><dd className={result && result.amount < 0 ? "err" : ""}>{result ? <>{result.amount > 0 ? "+" : ""}{gbp(result.amount)}{result.percent !== null && <span> ({result.percent.toFixed(2)}%)</span>}</> : "—"}</dd></div>
      <div><dt>Shares</dt><dd>{investment ? formatShares(investment.shares) : "—"}</dd></div>
      <div><dt>Average price</dt><dd>{investment ? averagePriceLabel(investment) : "—"}</dd></div>
      <div><dt>Dividend yield</dt><dd>{account.ratePct}%</dd></div>
    </dl>
    <p className="muted">{investment ? "Estimated capital return = current value − shares × average GBP purchase price. Excludes dividend payments and any fees outside your entered average price. Rounded provider figures can differ." : "Add shares and an average purchase price to see your estimated capital return. Your existing balance and income are kept."}</p>
  </section>;
}

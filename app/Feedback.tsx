"use client";

import { useRef, useState } from "react";
import { readCloudState } from "@/lib/cloud";
import { getItem } from "@/lib/db";
import { feedbackAreas, parseFeedback, type FeedbackArea } from "@/lib/feedback";
import { safeFetch } from "@/lib/worker-safety";
import { useUnsavedDraft } from "./useDraftGuard";
import styles from "./feedback.module.css";

const labels: Record<FeedbackArea, string> = { accounts: "Accounts", portfolio: "Dividend portfolio", credit: "Credit cards", payments: "Payments and reminders", signin: "Sign in", settings: "Settings", other: "Something else" };
export function Feedback({ onBack }: Readonly<{ onBack: () => void }>) {
  const [category, setCategory] = useState<"bug" | "improvement">("improvement");
  const [area, setArea] = useState<FeedbackArea>("accounts");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [receipt, setReceipt] = useState("");
  const id = useRef<string | null>(null);
  const commit = useUnsavedDraft({ category, area, message });
  function changed() { id.current = null; setError(""); }
  return <section aria-labelledby="feedback-title"><button className="btn ghost" disabled={busy} onClick={onBack}>← Back</button>
    <h1 id="feedback-title">Help improve Drip</h1>
    {receipt ? <section className="panel" role="status"><h2>Thanks for your feedback</h2><p>Your message was saved for the Drip team to review.</p><p className="muted">Reference: {receipt}</p><button className="btn" onClick={onBack}>Done</button></section> : <form className="panel" onSubmit={async event => {
      event.preventDefault(); setError("");
      const input = parseFeedback({ id: id.current ?? crypto.randomUUID(), category, area, message });
      if (!input) { setError("Enter a message of up to 5,000 characters."); return; }
      id.current = input.id; setBusy(true);
      try {
        const state = await readCloudState(); const gate = await getItem<{ signedOut: boolean; generation: string }>("deviceSession");
        if (!state || gate?.signedOut) throw new Error("Sign in and connect cloud recovery before sending feedback.");
        const response = await safeFetch("/api/feedback", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Drip-Owner": state.userId, "X-Drip-Reconnect": gate?.generation ?? "initial" }, body: JSON.stringify(input) });
        const result = await response.json();
        if (!response.ok || result.saved !== true || result.reference !== input.id) throw new Error(result.error ?? "Could not confirm your feedback was saved. Please retry.");
        commit(); setReceipt(input.id);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not send feedback. Please retry."); }
      finally { setBusy(false); }
    }}>
      <p>Tell us what could work better. Your message is not end-to-end encrypted: the Drip team and authorised agents can read what you submit.</p>
      <p className="muted">Please do not include passwords, recovery codes, account numbers or financial figures. Your message is linked to your Drip account; no account records are attached automatically.</p>
      <fieldset className={styles.fields} disabled={busy}><label htmlFor="feedback-category">Feedback type</label><select id="feedback-category" value={category} onChange={event => { setCategory(event.target.value as "bug" | "improvement"); changed(); }}><option value="improvement">Suggest an improvement</option><option value="bug">Report a problem</option></select>
      <label htmlFor="feedback-area">Which area?</label><select id="feedback-area" value={area} onChange={event => { setArea(event.target.value as FeedbackArea); changed(); }}>{feedbackAreas.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select>
      <label htmlFor="feedback-message">Your feedback</label><textarea className={styles.message} id="feedback-message" rows={6} maxLength={5000} value={message} onChange={event => { setMessage(event.target.value); changed(); }} />
      <p className="muted">{message.length} / 5,000 characters</p><button className="btn" type="submit" disabled={!message.trim()}>{busy ? "Sending…" : "Send feedback"}</button></fieldset>
      {error && <p className="err" role="alert">{error}</p>}
    </form>}
  </section>;
}

"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { areaLabels, emptyFeedbackDraft, feedbackAreas, validateFeedbackDraft, type FeedbackDraft, type FeedbackErrors, type FeedbackMessage } from "./feedback-model";
import s from "./feedback.module.css";

export default function FeedbackExperience() {
  const id = useId();
  const [draft, setDraft] = useState<FeedbackDraft>(emptyFeedbackDraft);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [step, setStep] = useState<"write" | "review" | "receipt">("write");
  const [errors, setErrors] = useState<FeedbackErrors>({});
  const heading = useRef<HTMLHeadingElement>(null);
  function go(next: typeof step) { setStep(next); requestAnimationFrame(() => heading.current?.focus()); }
  function change<K extends keyof FeedbackDraft>(field: K, value: FeedbackDraft[K]) { setDraft(previous => ({ ...previous, [field]: value })); setErrors({}); }
  function review(event: FormEvent) {
    event.preventDefault(); const result = validateFeedbackDraft(draft); setErrors(result.errors);
    if (result.message) { setMessage(result.message); go("review"); }
  }
  function reset() { setDraft(emptyFeedbackDraft()); setMessage(null); setErrors({}); go("write"); }
  return <section className={s.experience} aria-label="Feedback experience prototype">
    <p className={s.demoPill}>Interactive prototype · Nothing is sent</p>
    <h2 ref={heading} tabIndex={-1}>{step === "write" ? "Help shape Drip." : step === "review" ? "Review your message." : "A clear confirmation."}</h2>
    {step === "write" ? <><p className={s.intro}>Something not working, or an idea to make Drip better? We’d like to hear it.</p>
      <form noValidate onSubmit={review}>
        <fieldset className={s.categories}><legend>What would you like to share?</legend>
          <label className={draft.category === "bug" ? s.selected : ""}><input type="radio" name={`${id}-category`} checked={draft.category === "bug"} onChange={() => change("category", "bug")} /><span><b>Report a problem</b><small>Something isn’t working</small></span></label>
          <label className={draft.category === "improvement" ? s.selected : ""}><input type="radio" name={`${id}-category`} checked={draft.category === "improvement"} onChange={() => change("category", "improvement")} /><span><b>Suggest an improvement</b><small>Make something better</small></span></label>
        </fieldset>
        <label className={s.label} htmlFor={`${id}-area`}>Which part of Drip?</label><select id={`${id}-area`} value={draft.area} onChange={event => change("area", event.target.value as FeedbackDraft["area"])}>{feedbackAreas.map(area => <option key={area} value={area}>{areaLabels[area]}</option>)}</select>
        <label className={s.label} htmlFor={`${id}-message`}>{draft.category === "bug" ? "What happened?" : "What would you improve?"}</label>
        <textarea id={`${id}-message`} value={draft.description} maxLength={5000} rows={5} placeholder={draft.category === "bug" ? "Tell us what went wrong…" : "Tell us your idea…"} onChange={event => change("description", event.target.value)} aria-invalid={errors.description ? true : undefined} aria-describedby={`${id}-privacy`} />
        <p id={`${id}-privacy`} className={s.hint}>Please leave out passwords, recovery codes and financial figures.</p>
        {draft.category === "bug" ? <details className={s.extra}><summary>Add more detail <span>(optional)</span></summary><label className={s.label} htmlFor={`${id}-steps`}>Steps to reproduce</label><textarea id={`${id}-steps`} rows={3} maxLength={3000} value={draft.reproduction} onChange={event => change("reproduction", event.target.value)} /><label className={s.label} htmlFor={`${id}-expected`}>What did you expect?</label><textarea id={`${id}-expected`} rows={2} maxLength={2000} value={draft.expected} onChange={event => change("expected", event.target.value)} /></details> : null}
        {Object.keys(errors).length ? <div role="alert" className={s.error}>{Object.entries(errors).map(([key, value]) => <p key={key}>{value}</p>)}</div> : null}
        <button className={s.primary} type="submit">Review message <span aria-hidden="true">→</span></button>
      </form></> : step === "review" && message ? <>
      <p className={s.intro}>Choose what you share. This preview won’t contact the team.</p>
      <div className={s.messagePreview} aria-label="Message preview"><div className={s.messageMeta}><span>{message.category === "bug" ? "Problem" : "Improvement"}</span><span>{areaLabels[message.area]}</span></div><p>{message.description}</p>{message.reproduction ? <><h3>Steps to reproduce</h3><p>{message.reproduction}</p></> : null}{message.expected ? <><h3>Expected result</h3><p>{message.expected}</p></> : null}</div>
      <p className={s.hint}>Only your message and chosen screen are shown here. No account details are attached.</p>
      <button className={s.primary} onClick={() => go("receipt")}>Preview confirmation <span aria-hidden="true">→</span></button><button className={s.textButton} onClick={() => go("write")}>Edit message</button>
    </> : <>
      <div className={s.receiptMark} aria-hidden="true">✓</div><p className={s.intro}>In the connected version, Drip will confirm once your message is safely saved, even if the team inbox is temporarily unavailable.</p>
      <div className={s.receipt} aria-label="Sample feedback receipt"><span>Sample reference</span><strong>DEMO-001</strong><p>Example only. No message has been saved or sent.</p></div>
      <button className={s.primary} onClick={reset}>Try another message</button>
    </>}
  </section>;
}

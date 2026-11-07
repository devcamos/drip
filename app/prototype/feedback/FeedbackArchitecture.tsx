"use client";

import { useState, type ReactNode } from "react";
import s from "./feedback.module.css";

function Node({ kind, title, children }: { kind: string; title: string; children: ReactNode }) {
  return <article className={s.node}><span>{kind}</span><h3>{title}</h3><p>{children}</p></article>;
}

export default function FeedbackArchitecture() {
  const [level, setLevel] = useState<"context" | "containers">("context");
  const [scenario, setScenario] = useState<"normal" | "notion" | "offline">("normal");
  return <section className={s.architecture} aria-label="Proposed feedback architecture">
    <div className={s.sectionHeading}><div><p className={s.eyebrow}>DISCUSS THE DESIGN</p><h2>One message. A clear route to the team.</h2></div><span className={s.proposed}>Proposed · Services not connected</span></div>
    <p className={s.intro}>C4 diagrams show who is involved, then the components that would make delivery reliable. Adapted from Bible Compass’s existing feedback architecture.</p>
    <div className={s.segment} role="group" aria-label="C4 diagram level"><button aria-pressed={level === "context"} onClick={() => setLevel("context")}>C4 context</button><button aria-pressed={level === "containers"} onClick={() => setLevel("containers")}>C4 containers</button></div>
    {level === "context" ? <div aria-label="C4 context diagram"><p className={s.diagramCaption}>Level 1 · People and systems</p><ol className={s.flow}>
      <li><Node kind="PERSON" title="You">Report a problem or suggest an improvement, even before signing in.</Node></li>
      <li><Node kind="SYSTEM" title="Drip">Accepts the message and confirms when it has been safely saved.</Node></li>
      <li><Node kind="EXTERNAL SYSTEM" title="Private Notion inbox">Gives the team a place to review, prioritise and assign feedback.</Node></li>
      <li><Node kind="PERSON" title="Nexus reviewer">Decides which feedback becomes an accepted piece of work.</Node></li>
    </ol><p className={s.acceptedWork}>Accepted feedback → sanitised GitHub issue → change in Preview → owner approval.</p></div> : <div aria-label="C4 container diagram">
      <p className={s.diagramCaption}>Level 2 · Inside Drip</p><div className={s.boundary}><span className={s.boundaryLabel}>DRIP APPLICATION</span><ol className={s.flow}>
        <li><Node kind="BROWSER · REACT" title="Feedback screen">Collects the message and chosen screen. Retains a draft for retry.</Node></li>
        <li><Node kind="SERVER · NEXT.JS" title="Feedback API">Checks the request, limits abuse and recognises duplicate retries.</Node></li>
        <li><Node kind="DATABASE · POSTGRES" title="Feedback store">Saves the message and delivery task together, then returns a reference.</Node></li>
        <li><Node kind="SERVER WORKER" title="Delivery worker">Sends queued messages to Notion and retries temporary failures.</Node></li>
      </ol><p className={s.boundaryFoot}>Dedicated feedback storage and runtime role. Separate from Drip’s financial vault and sign-in credentials.</p></div>
      <div className={s.externalDestination}><span aria-hidden="true">↓</span><b>Private Drip Notion inbox</b><p>Nexus reviews the message; only accepted, sanitised work moves to GitHub.</p></div>
    </div>}
    <section className={s.delivery} aria-label="Delivery scenarios"><div className={s.sectionHeading}><div><p className={s.eyebrow}>WHAT HAPPENS WHEN…</p><h2>Feedback should survive a delay.</h2></div></div>
      <div className={s.scenarios} role="group" aria-label="Explore delivery"><button aria-pressed={scenario === "normal"} onClick={() => setScenario("normal")}>Normal delivery</button><button aria-pressed={scenario === "notion"} onClick={() => setScenario("notion")}>Notion unavailable</button><button aria-pressed={scenario === "offline"} onClick={() => setScenario("offline")}>No connection</button></div>
      <div className={s.scenarioResult} aria-live="polite">{scenario === "normal" ? <><h3>Saved first, then delivered.</h3><ol><li>Drip saves the message and gives you a reference.</li><li>The worker delivers it to the private inbox.</li><li>A reviewer decides what happens next.</li></ol></> : scenario === "notion" ? <><h3>Saved, waiting for delivery.</h3><p>The message stays in the feedback store. The worker retries; Drip keeps working. A delayed inbox does not lose an accepted message.</p></> : <><h3>Keep the draft. Retry when connected.</h3><p>Without a server acknowledgement, Drip must not say the message was received. Keep the draft and retry the same submission when the connection returns.</p></>}</div>
    </section>
    <div className={s.decisions}><article><h3>What Drip would collect</h3><p>Your message, chosen screen, build version and a submission reference. No automatic financial account data, gamertag, recovery code or session token.</p></article><article><h3>What we reuse</h3><p>Bible Compass’s validation, saved receipt, delivery queue and private triage pattern. Drip gets its own configuration and data destination.</p></article><article><h3>What comes after discussion</h3><p>Agree the flow, then add the API, dedicated store and worker in Preview. App ratings can follow. Production and actual delivery stay a separate decision.</p></article></div>
    <a className={s.sourceLink} href="https://github.com/devcamos/bible-compass/blob/d20177798a293f1e13b95a53a2e7fdf28c5a3951/docs/feedback-architecture.md" target="_blank" rel="noopener noreferrer">Read the Bible Compass architecture <span aria-hidden="true">↗</span></a>
  </section>;
}

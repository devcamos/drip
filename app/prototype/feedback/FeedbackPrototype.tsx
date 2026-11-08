"use client";

import { useState } from "react";
import { Brand } from "../welcome/WelcomePanels";
import FeedbackArchitecture from "./FeedbackArchitecture";
import FeedbackExperience from "./FeedbackExperience";
import s from "./feedback.module.css";

export default function FeedbackPrototype() {
  const [view, setView] = useState<"architecture" | "experience">("architecture");
  return <div className={s.page}>
    <div className={s.reviewBar}><div><b>Feedback engine</b><span>Design discussion · Interactive prototype</span></div><a href="/prototype/welcome">Back to account prototype</a></div>
    <main className={s.design}><header className={s.brandHeader}><Brand /><span>Little drops. Better together.</span></header>
      <section className={s.hero}><p className={s.eyebrow}>SHAPE WHAT COMES NEXT</p><h1>Feedback that <em>reaches the team.</em></h1><p>Explore the proposed journey and its architecture before connecting any services.</p></section>
      <div className={s.segment} role="group" aria-label="Feedback prototype view"><button aria-pressed={view === "architecture"} onClick={() => setView("architecture")}>C4 diagrams</button><button aria-pressed={view === "experience"} onClick={() => setView("experience")}>Try feedback</button></div>
      {view === "architecture" ? <FeedbackArchitecture /> : <div className={s.experienceCanvas}><FeedbackExperience /></div>}
      <footer className={s.footer}>Prototype only. No feedback is saved, sent to Notion or turned into a GitHub issue.</footer>
    </main>
  </div>;
}

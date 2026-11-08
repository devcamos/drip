"use client";

import { useEffect, useRef } from "react";
import FeedbackExperience from "./FeedbackExperience";
import s from "./feedback.module.css";

export default function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; if (open) { element.showModal(); element.querySelector("h2")?.focus(); } else element.close(); return () => element.close(); }, [open]);
  return <dialog ref={dialog} className={s.dialog} aria-label="Give feedback" onCancel={onClose}>
    <div className={s.dialogBar}><span>DRIP · GIVE FEEDBACK</span><button onClick={onClose} aria-label="Close feedback">×</button></div>
    <FeedbackExperience />
  </dialog>;
}

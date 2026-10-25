"use client";
import { useEffect, useRef, useState } from "react";
import { recoveryReadiness } from "@/lib/recovery-readiness";

export function RecoveryTask({ onSetup }: Readonly<{ onSetup: () => void }>) {
  const [phase, setPhase] = useState<"checking" | "needed" | "complete" | "hidden">("checking");
  const phaseRef = useRef(phase);
  useEffect(() => {
    let active = true; let sequence = 0;
    const check = async () => {
      const id = ++sequence;
      try {
        const state = await recoveryReadiness();
        if (!active || id !== sequence) return;
        const complete = state.passkey || state.codesSaved;
        let next: typeof phaseRef.current = "needed";
        if (complete) next = phaseRef.current === "needed" ? "complete" : "hidden";
        phaseRef.current = next; setPhase(next);
      } catch {
        // Unknown storage cannot establish that a fallback was saved.
        if (active && id === sequence && phaseRef.current === "checking") { phaseRef.current = "needed"; setPhase("needed"); }
      }
    };
    void check(); window.addEventListener("drip-recovery-changed", check);
    return () => { active = false; sequence++; window.removeEventListener("drip-recovery-changed", check); };
  }, []);
  useEffect(() => {
    if (phase !== "complete") return;
    const timer = setTimeout(() => { phaseRef.current = "hidden"; setPhase("hidden"); }, 1200);
    return () => clearTimeout(timer);
  }, [phase]);
  if (phase === "checking" || phase === "hidden") return null;
  return <section className={`panel install-task${phase === "complete" ? " is-complete" : ""}`} aria-label="Account recovery setup">
    {phase === "complete" ? <output className="recovery-task-complete">Recovery is ready. You have another way back in.</output> : <>
      <h2>Keep a way back in</h2>
      <p className="muted">Set up an unlock passkey or save your recovery codes, so losing your password doesn’t lock you out.</p>
      <button className="btn ghost" onClick={onSetup}>Set up recovery</button>
    </>}
  </section>;
}

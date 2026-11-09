"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

export function useDraftGuardState() {
  const entries = useRef(new Set<string>());
  const [dirty, setDirty] = useState(false);
  const register = useCallback((id: string, changed: boolean) => {
    if (changed) entries.current.add(id); else entries.current.delete(id);
    setDirty(entries.current.size > 0);
  }, []);
  const reset = useCallback(() => { entries.current.clear(); setDirty(false); }, []);
  const leave = useCallback(() => {
    if (entries.current.size && !window.confirm("Discard your unsaved changes?")) return false;
    // Unmount or a successful save clears entries. A later cancelled action
    // (for example cancelling archive confirmation) must retain the dirty state.
    return true;
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return { dirty, register, leave, reset };
}
export const DraftGuardContext = createContext<ReturnType<typeof useDraftGuardState> | null>(null);

/** Register each form independently so closing one draft cannot clear another. */
export function useUnsavedDraft(value: unknown, active = true) {
  const register = useContext(DraftGuardContext)?.register;
  const id = useId(), signature = JSON.stringify(value);
  const initial = useRef(signature);
  useEffect(() => { register?.(id, active && signature !== initial.current); }, [register, id, signature, active]);
  useEffect(() => () => register?.(id, false), [register, id]);
  return (savedValue: unknown = value) => { initial.current = JSON.stringify(savedValue); register?.(id, false); };
}

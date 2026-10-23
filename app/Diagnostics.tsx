"use client";
import { useEffect } from "react";
import { logFailure } from "@/lib/diagnostics";

export default function Diagnostics() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => logFailure("app.unhandled", event.error);
    const onRejection = (event: PromiseRejectionEvent) => logFailure("app.unhandled", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}

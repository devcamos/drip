"use client";
import { useEffect } from "react";
import { logFailure } from "@/lib/diagnostics";

export default function ErrorPage({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  useEffect(() => { logFailure("app.render", error); }, [error]);
  return <main><h1>Drip couldn’t open this screen</h1>
    <p role="alert">Try opening it again. If this continues, close and reopen Drip.</p>
    <button className="btn" onClick={reset}>Try again</button>
  </main>;
}

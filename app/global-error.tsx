"use client";
import ErrorPage from "./error";

export default function GlobalError(props: Readonly<{ error: Error; reset: () => void }>) {
  return <html lang="en-GB"><body><ErrorPage {...props} /></body></html>;
}

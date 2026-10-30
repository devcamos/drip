"use client";
import { useState, type InputHTMLAttributes } from "react";

export function PasswordInput({ visibilityLabel = "password", ...props }: Readonly<Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { visibilityLabel?: string }>) {
  const [visible, setVisible] = useState(false);
  return <div className="password-input">
    <input {...props} type={visible ? "text" : "password"} autoCapitalize="none" spellCheck={false} />
    <button type="button" className="password-visibility" disabled={props.disabled} aria-controls={props.id} aria-pressed={visible} aria-label={`${visible ? "Hide" : "Show"} ${visibilityLabel}`} onClick={() => setVisible(value => !value)}>{visible ? "Hide" : "Show"}</button>
  </div>;
}

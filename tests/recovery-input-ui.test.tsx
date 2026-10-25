// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { RecoveryCodeInput, RecoveryHelp } from "../app/RecoveryCodeInput";
import { generateRecoveryCode } from "../lib/crypto";

function Panel() { const [code, setCode] = useState(""); return <RecoveryCodeInput id="recovery" value={code} onChange={setCode} />; }
it("loads a local code file without submitting it and masks every selectable code", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const codes = Array.from({ length: 6 }, () => `DRIP2-${generateRecoveryCode()}`);
  render(<Panel />);
  fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [{ size: 500, text: async () => codes.join("\n") }] } });
  expect(await screen.findByRole("status")).toHaveTextContent("6 recovery codes loaded");
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue(codes[0]);
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveAttribute("type", "password");
  expect(screen.getAllByRole("option")).toHaveLength(6);
  expect(screen.getByRole("combobox")).not.toHaveTextContent(codes[0]);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "4" } });
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue(codes[4]);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not overwrite a manually edited code after a slow file read completes", async () => {
  let finish!: (value: string) => void;
  const pending = new Promise<string>(resolve => { finish = resolve; });
  render(<Panel />);
  fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [{ size: 100, text: () => pending }] } });
  fireEvent.change(screen.getByLabelText("Recovery code", { exact: true }), { target: { value: "manually entered" } });
  finish(generateRecoveryCode());
  await waitFor(() => expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue("manually entered"));
  expect(screen.queryByRole("combobox")).toBeNull();
});
it("rejects bad files and gives honest guidance without offering an unimplemented email reset", async () => {
  render(<><Panel /><RecoveryHelp /></>);
  fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [{ size: 50, text: async () => "not a recovery file" }] } });
  expect(await screen.findByRole("status")).toHaveTextContent("No supported recovery-code list");
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [{ size: 40_000 }] } });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("32 KB"));
  expect(screen.getByText(/currently has no email reset/)).toBeInTheDocument();
});

function pendingRead() {
  let resolve!: (text: string) => void;
  let reject!: (error: Error) => void;
  const text = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { file: { size: 100, text: () => text }, resolve, reject };
}

it("keeps the newest selected file when an older read fails later", async () => {
  const first = pendingRead(); const second = pendingRead(); const code = generateRecoveryCode();
  render(<Panel />);
  const file = screen.getByLabelText("Recovery codes file");
  fireEvent.change(file, { target: { files: [first.file] } });
  fireEvent.change(file, { target: { files: [second.file] } });
  await act(async () => { second.resolve(code); });
  expect(screen.getByRole("status")).toHaveTextContent("1 recovery code loaded");
  await act(async () => { first.reject(new Error("Private filesystem details")); });
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue(code);
  expect(screen.getByRole("status")).toHaveTextContent("1 recovery code loaded");
  expect(screen.queryByRole("combobox")).toBeNull();
});

it("shows a safe read failure, clears the rejected credential and allows retrying", async () => {
  const first = pendingRead(); const code = generateRecoveryCode();
  render(<Panel />);
  fireEvent.change(screen.getByLabelText("Recovery code", { exact: true }), { target: { value: "previous credential" } });
  const file = screen.getByLabelText("Recovery codes file");
  fireEvent.change(file, { target: { files: [first.file] } });
  await act(async () => { first.reject(new Error("Private filesystem details")); });
  expect(screen.getByRole("status")).toHaveTextContent("Could not read this file");
  expect(screen.getByRole("status")).not.toHaveTextContent("Private filesystem details");
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue("");
  fireEvent.change(file, { target: { files: [{ size: 100, text: async () => code }] } });
  expect(await screen.findByText(/1 recovery code loaded/)).toBeInTheDocument();
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue(code);
});

it.each(["disabled", "unmounted", "cancelled"])("discards a pending import after the input is %s", async state => {
  const pending = pendingRead(); const change = vi.fn();
  const view = render(<RecoveryCodeInput id="pending" value="" onChange={change} />);
  fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [pending.file] } });
  if (state === "disabled") {
    view.rerender(<RecoveryCodeInput id="pending" value="" onChange={change} disabled />);
    expect(screen.getByLabelText("Recovery codes file")).toBeDisabled();
    expect(screen.getByLabelText("Recovery code", { exact: true })).toBeDisabled();
  } else if (state === "unmounted") view.unmount();
  else fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [] } });
  await act(async () => { pending.resolve(generateRecoveryCode()); });
  expect(change).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
});

it("clears the imported selection and its status when a code is edited manually", async () => {
  const codes = [generateRecoveryCode(), generateRecoveryCode()];
  render(<Panel />);
  fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [{ size: 100, text: async () => codes.join("\n") }] } });
  await screen.findByRole("combobox");
  fireEvent.change(screen.getByLabelText("Recovery code", { exact: true }), { target: { value: "manual code" } });
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue("manual code");
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

it.each([
  ["drip-recovery-codes.txt", "text/plain", "1. ABCD-EFGH"],
  ["backup.json", "application/json", '{"accounts":[]}'],
  ["photo.png", "image/png", "\u0089PNG\u0000\u0000binary data"],
])("rejects unsupported content in %s without accepting the file type as proof", async (name, type, content) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const file = new File([content], name, { type });
  // jsdom File supplies metadata but not the browser's Blob.text() method.
  Object.defineProperty(file, "text", { value: async () => content });
  render(<Panel />);
  fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [file] } });
  expect(await screen.findByRole("status")).toHaveTextContent("No supported recovery-code list");
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue("");
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("accepts a valid downloaded text file with a generic file-manager MIME type", async () => {
  const code = generateRecoveryCode(); const content = `Drip recovery codes\n1. ${code}`;
  const file = new File([content], "drip-recovery-codes.txt", { type: "application/octet-stream" });
  Object.defineProperty(file, "text", { value: async () => content });
  render(<Panel />);
  fireEvent.change(screen.getByLabelText("Recovery codes file"), { target: { files: [file] } });
  expect(await screen.findByRole("status")).toHaveTextContent("1 recovery code loaded");
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue(code);
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveAttribute("type", "password");
});

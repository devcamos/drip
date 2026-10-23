// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

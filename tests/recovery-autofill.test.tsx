// @vitest-environment jsdom
import { useLayoutEffect } from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
const sessions = vi.hoisted(() => ({ finishDeviceSignOut: vi.fn(async () => {}), readDeviceSession: vi.fn(async () => undefined) }));
vi.mock("../lib/device-session", async original => ({ ...await original<typeof import("../lib/device-session")>(), ...sessions }));
import { SignedOut } from "../app/DeviceSession";
import { fixtureCode } from "./storage-fixtures";

it("keeps a recovery code autofilled between mount and passive effects", () => {
  function Autofill() {
    useLayoutEffect(() => { fireEvent.change(screen.getByLabelText("Recovery code", { exact: true }), { target: { value: fixtureCode } }); }, []);
    return <SignedOut mode="migration" onSignedIn={vi.fn()} />;
  }
  render(<Autofill />);
  expect(screen.getByLabelText("Recovery code", { exact: true })).toHaveValue(fixtureCode);
  expect(screen.getByRole("button", { name: "Encrypt local data" })).toBeEnabled();
});

it("clears recovery credentials when leaving the screen and does not restore them on return", async () => {
  render(<SignedOut mode="locked" onSignedIn={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  const input = await screen.findByLabelText("Recovery code", { exact: true });
  fireEvent.change(input, { target: { value: fixtureCode } });
  expect(input).toHaveValue(fixtureCode);
  fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
  expect(screen.queryByLabelText("Recovery code", { exact: true })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  expect(await screen.findByLabelText("Recovery code", { exact: true })).toHaveValue("");
});

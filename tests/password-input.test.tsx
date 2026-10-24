// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PasswordInput } from "../app/PasswordInput";

it("reveals and masks the exact password without changing its value, autocomplete or submitting", () => {
  const changed = vi.fn(), submitted = vi.fn(event => event.preventDefault());
  render(<form aria-label="Test sign-in" onSubmit={submitted}><label htmlFor="secret">Password</label><PasswordInput id="secret" autoComplete="current-password" value=" A long passphrase! " onChange={changed} /></form>);
  const input = screen.getByLabelText("Password", { exact: true });
  expect(input).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(input).toHaveAttribute("type", "text"); expect(input).toHaveValue(" A long passphrase! ");
  expect(input).toHaveAttribute("autocomplete", "current-password");
  expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  expect(changed).not.toHaveBeenCalled(); expect(submitted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(input).toHaveAttribute("type", "password"); expect(input).toHaveValue(" A long passphrase! ");
});

it("keeps confirmation visibility independent and respects a busy form", () => {
  render(<><label htmlFor="first">New password</label><PasswordInput id="first" visibilityLabel="new password" autoComplete="new-password" defaultValue="Synthetic first" /><label htmlFor="second">Confirmation</label><PasswordInput id="second" visibilityLabel="password confirmation" defaultValue="Synthetic second" /><label htmlFor="busy">Busy password</label><PasswordInput id="busy" visibilityLabel="busy password" disabled /></>);
  fireEvent.click(screen.getByRole("button", { name: "Show password confirmation" }));
  expect(screen.getByLabelText("Confirmation")).toHaveAttribute("type", "text");
  expect(screen.getByLabelText("New password")).toHaveAttribute("type", "password");
  expect(screen.getByRole("button", { name: "Show busy password" })).toBeDisabled();
});

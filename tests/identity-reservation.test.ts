import { afterEach, expect, it, vi } from "vitest";
import { newIdentity } from "../lib/identity";

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("../lib/worker-safety", () => ({ safeFetch }));
import { reserveIdentity } from "../lib/identity-reservation";
afterEach(() => { vi.restoreAllMocks(); safeFetch.mockReset(); });

it("posts only the profile identity, requested handle and explicit mode", async () => {
  const identity = newIdentity("riverbank");
  safeFetch.mockResolvedValue(Response.json({ identityId: identity.id, handle: "riverbank", suffix: "4821", changed: true }));
  await expect(reserveIdentity(identity, "rename")).resolves.toMatchObject({ ...identity, suffix: "4821" });
  expect(safeFetch).toHaveBeenCalledWith("/api/identity/handle", expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", body: JSON.stringify({ identityId: identity.id, handle: identity.handle, mode: "rename" }) }));
});

it("uses ensure mode by default for idempotent sync", async () => {
  const identity = newIdentity("riverbank"); safeFetch.mockResolvedValue(Response.json({ identityId: identity.id, handle: identity.handle, changed: false }));
  await expect(reserveIdentity(identity)).resolves.toMatchObject(identity);
  expect(JSON.parse(safeFetch.mock.calls[0][1].body).mode).toBe("ensure");
});

it("surfaces safe reservation errors from the server", async () => {
  safeFetch.mockResolvedValue(Response.json({ error: "That profile belongs to a different account." }, { status: 409 }));
  await expect(reserveIdentity(newIdentity("riverbank"))).rejects.toThrow("That profile belongs to a different account.");
});

it("rejects malformed or mismatched server assignments", async () => {
  const identity = newIdentity("riverbank");
  for (const body of [
    { identityId: newIdentity("someoneelse").id, handle: "riverbank", changed: true },
    { identityId: identity.id, handle: "riverbank", suffix: "abc", changed: true },
    { identityId: identity.id, handle: "x", changed: true },
  ]) {
    safeFetch.mockResolvedValueOnce(Response.json(body));
    await expect(reserveIdentity(identity)).rejects.toThrow(/Could not confirm your profile gamertag/);
  }
});

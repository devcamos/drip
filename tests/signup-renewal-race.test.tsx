// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { SignupRecovery } from "../app/SignupRecovery";
import { codeVerifier, deriveCloudEncryptionKey, generateRecoveryCode } from "../lib/crypto";
import { wrapPasswordRoot } from "../lib/password-crypto";
import { commitCloudRestore, emptyData, getItem, setItem, signupRecoveryContext } from "../lib/db";
import { fixtureCode } from "./storage-fixtures";

// Keep the real connect/auth client/request lock. Only the session lookup and
// network response are synthetic; this test creates no hosted account or cookie.
vi.mock("../lib/cloud", async original => ({ ...await original<typeof import("../lib/cloud")>(), authClient: { getSession: async () => ({ data: null }) } }));

it.each([false, true])("blocks a queued initial-signup renewal after account switching (unmounted=%s)", async unmounted => {
  const identity = { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "demo", createdAt: "now" };
  const data = { ...emptyData(), identity };
  const envelope = await wrapPasswordRoot(fixtureCode, "demo", "Synthetic diagnostic password 42!", "owner");
  await commitCloudRestore(data, { userId: "owner", identityId: identity.id, key: await deriveCloudEncryptionKey(fixtureCode), version: 1, dirty: false, lastSyncAt: "now", generation: "cloud", revision: 0 }, await codeVerifier(fixtureCode), undefined, undefined, fixtureCode, envelope);
  expect((await signupRecoveryContext()).generation).toBeUndefined();
  let release!: () => Promise<void>;
  vi.stubGlobal("navigator", { locks: { request: (_name: string, run: () => Promise<Response>) => new Promise<Response>((resolve, reject) => {
    release = async () => { try { resolve(await run()); } catch (error) { reject(error); } };
  }) } });
  const fetcher = vi.fn(async () => Response.json({ user: { id: "owner", email: "synthetic@recovery.drip.invalid" }, token: "synthetic" }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<SignupRecovery onSaved={async () => {}} />);
  await vi.waitFor(() => expect(release).toBeDefined());
  if (unmounted) view.unmount();
  await setItem("deviceSession", { signedOut: true, generation: "signed-out" });
  const otherRoot = generateRecoveryCode();
  const otherIdentity = { ...identity, id: "aa1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "other_demo" };
  await commitCloudRestore({ ...emptyData(), identity: otherIdentity }, { userId: "other-owner", identityId: otherIdentity.id, key: await deriveCloudEncryptionKey(otherRoot), version: 1, dirty: false, lastSyncAt: "now", generation: "other-cloud", revision: 0 }, await codeVerifier(otherRoot), "signed-out", "signed-out", otherRoot);
  expect((await getItem<{ signedOut: boolean }>("deviceSession"))?.signedOut).toBe(false);
  await act(async () => release());
  expect(fetcher).not.toHaveBeenCalled();
  expect((await getItem<{ userId: string }>("cloudState"))?.userId).toBe("other-owner");
});

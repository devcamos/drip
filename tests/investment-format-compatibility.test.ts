import { expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("better-auth/client", () => ({ createAuthClient: () => auth }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import { cloudKey, seal, unseal } from "../lib/cloud";
import { encryptBackup, decryptBackup } from "../lib/crypto";
import { dataFormatVersion } from "../lib/data-format";
import { emptyData } from "../lib/db";
import { isCloudEnvelope } from "../server/cloud-store";
import * as legacyCloud from "./fixtures/pre-investment-cloud";
import * as legacyBackup from "./fixtures/pre-investment-crypto";
import { fixtureCode, rawStore, seedVault } from "./storage-fixtures";
import type { Account } from "../lib/types";
const investment = { shares: 27.25750597, averagePriceGBP: 44.99, originalPrice: { currency: "USD" as const, averagePrice: 60.41 } };
const holding: Account = { id: "stock", label: "", provider: "Trading212", productCategory: "stocks-funds", holdingName: "Realty Income", balance: 1155.28, ratePct: 5.7, rateType: "dividend", frequency: "monthly", nextPayoutDate: "2027-01-01", colour: "#6b2d83", payouts: [], createdAt: "2026-10-01", investment };
const data = { ...emptyData(), identity: { id: "6f1c2a4e-0b7d-4c1e-9a2f-3d5e8b7c9a10", handle: "demo", createdAt: "2026-10-01" }, accounts: [holding] };

it("feature-bearing cloud v2 survives current restore and cannot be decoded or downgraded by the actual old client", async () => {
  const key=await cloudKey(fixtureCode), envelope=await seal(data,key);
  expect(envelope.v).toBe(2);expect(isCloudEnvelope(envelope)).toBe(true);expect((await unseal(envelope,key)).accounts[0].investment).toEqual(investment);
  await expect(legacyCloud.unseal(envelope as legacyCloud.Envelope,key)).rejects.toThrow("Unsupported cloud copy");
  await expect(unseal({...envelope,v:1},key)).rejects.toThrow();await expect(legacyCloud.unseal({...envelope,v:1},key)).rejects.toThrow();
  expect(isCloudEnvelope({...envelope,v:3})).toBe(false);expect(isCloudEnvelope({...envelope,v:"2"})).toBe(false);
});
it("the real old syncNow cannot clean away stats, PUT, or acknowledge a newer format even at the same cloud revision",async()=>{
  const key=await cloudKey(fixtureCode);await seedVault(data,fixtureCode,{userId:"owner",identityId:data.identity.id,key,version:2,dirty:false,lastSyncAt:null,generation:"old-client",revision:0});
  auth.getSession.mockResolvedValue({data:{user:{id:"owner"}}});
  await rawStore({browserDeviceId:"11111111-1111-4111-8111-111111111111"});
  const remote=await seal(data,key),before=await rawStore();const fetcher=vi.fn().mockResolvedValue(Response.json({version:2,envelope:remote}));vi.stubGlobal("fetch",fetcher);
  await expect(legacyCloud.syncNow()).rejects.toThrow("Unsupported cloud copy");
  expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].method).toBe("GET");expect(await rawStore()).toEqual(before);
});
it("keeps ordinary cloud copies at v1, readable by deployed and new clients",async()=>{
  const ordinary={...data,accounts:[{...holding,investment:undefined}]},key=await cloudKey(fixtureCode),current=await seal(ordinary,key),old=await legacyCloud.seal(ordinary,key);
  expect(current.v).toBe(1);expect(old.v).toBe(1);expect((await legacyCloud.unseal(current as legacyCloud.Envelope,key)).accounts[0].balance).toBe(1155.28);expect((await unseal(old,key)).accounts[0].balance).toBe(1155.28);
});
it("protects new fields in v2 backup files, rejects old-client restore before install, and still restores actual v1 backups",async()=>{
  const file=await encryptBackup(data,fixtureCode,100000);expect(file.v).toBe(2);expect(await decryptBackup(file,fixtureCode)).toEqual(data);
  await expect(legacyBackup.decryptBackup(file,fixtureCode)).rejects.toThrow("isn't a Drip backup");await expect(decryptBackup({...file,v:1},fixtureCode)).rejects.toThrow();
  const ordinary={...data,accounts:[{...holding,investment:undefined}]};const old=await legacyBackup.encryptBackup(ordinary,fixtureCode,100000),current=await encryptBackup(ordinary,fixtureCode,100000);
  expect(current.v).toBe(1);expect(await decryptBackup(old,fixtureCode)).toEqual(JSON.parse(JSON.stringify(ordinary)));expect(await legacyBackup.decryptBackup(current,fixtureCode)).toEqual(JSON.parse(JSON.stringify(ordinary)));
});
it("does not change formats for non-financial original-code wrappers or data without holdings",()=>{
  for(const value of [null,undefined,"original recovery wrapper",{}, {accounts:null}, {accounts:[null,1,{}]}, {accounts:[]},{accounts:[{investment:undefined}]}])expect(dataFormatVersion(value)).toBe(1);
  expect(dataFormatVersion({accounts:[{investment}]})).toBe(2);
});

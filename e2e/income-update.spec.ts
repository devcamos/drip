import { test, expect } from "@playwright/test";
import { createServer, request as proxyRequest } from "node:http";
import { execFileSync } from "node:child_process";
import { legacyAccount } from "./legacy-account-helpers";
import { unlock } from "./vault-helpers";

test("actual main worker3 upgrades to worker4 on a stable origin without changing encrypted accounts", async ({ browser }) => {
  test.skip(!process.env.DRIP_NOTIFICATION_UPGRADE, "Requires actual base and candidate servers on4321/4329.");
  let port = 4321;
  const proxy = createServer((req, res) => {
    const upstream = proxyRequest({ hostname: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); });
    upstream.on("error", () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
  });
  await new Promise<void>(resolve => proxy.listen(4339,"127.0.0.1",resolve));
  const context = await browser.newContext({baseURL:"http://127.0.0.1:4339"}), page = await context.newPage();
  try {
    const oldWorker = await (await page.request.get("/sw.js")).text(); expect(oldWorker).toBe(execFileSync("git",["show","cd07041:public/sw.js"],{encoding:"utf8"}));
    const code = await legacyAccount(page,"update_income",[{id:"saved-cash",provider:"Zopa",label:"",balance:3000,ratePct:4,rateType:"interest",frequency:"monthly",nextPayoutDate:"2026-11-01",colour:"#176b9a",createdAt:"2026-01-01",payouts:[]}]);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const records = () => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>(resolve => { const r=indexedDB.open("drip"); r.onsuccess=()=>resolve(r.result); });
      return new Promise<string>(resolve => { const tx=db.transaction("kv"),s=tx.objectStore("kv"),data=s.get("data"),vault=s.get("localVault");tx.oncomplete=()=>{db.close();resolve(JSON.stringify({data:data.result,vault:vault.result}));}; });
    });
    const before = await records(); expect(before).not.toContain('"balance"');
    const oldTab = await context.newPage(); await oldTab.goto("/"); await unlock(oldTab, code); await oldTab.evaluate(() => { document.documentElement.dataset.retained="yes"; });
    port=4329; await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.getByRole("button",{name:"Reload update"})).toBeVisible({timeout:30000});
    await expect(page.getByRole("button",{name:/Zopa/})).toContainText("£3,000.00");
    await page.getByRole("button",{name:"Reload update"}).click(); await unlock(page,code);
    await expect(page.getByRole("navigation").getByRole("button",{name:"Portfolio",exact:true})).toBeVisible(); expect(await records()).toBe(before);
    expect(await oldTab.evaluate(() => document.documentElement.dataset.retained)).toBe("yes");
    const version = await page.evaluate(() => new Promise<number>(resolve => { const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data.version);navigator.serviceWorker.controller!.postMessage({type:"DRIP_WORKER_VERSION"},[c.port2]); })); expect(version).toBe(4);
    await context.setOffline(true); await page.reload(); await unlock(page,code); await expect(page.getByRole("button",{name:/Zopa/})).toContainText("£3,000.00"); expect(await records()).toBe(before);
    const paths=await page.evaluate(async ()=>(await Promise.all((await caches.keys()).map(async name=>(await(await caches.open(name)).keys()).map(r=>new URL(r.url).pathname)))).flat()); expect(paths.some(p=>p.startsWith("/api/"))).toBe(false);
  } finally { await context.close(); await new Promise<void>(resolve=>proxy.close(()=>resolve())); }
});

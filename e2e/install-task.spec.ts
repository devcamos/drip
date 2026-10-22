import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { legacyAccount } from './legacy-account-helpers';
import { unlock } from './vault-helpers';

test('install task completes, fades and stays completed after encrypted reload',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'iPhone'}));
 const code=await legacyAccount(page,'drip_demo',[{id:'install-demo',provider:'Zopa',label:'',balance:3000,ratePct:4,rateType:'interest',frequency:'monthly',nextPayoutDate:'2027-01-01',colour:'#2b2d86',payouts:[],events:[],createdAt:'2026-10-01'}]);
 const task=page.getByRole('region',{name:'Install Drip task'});
 await expect(task).toBeVisible();
 async function capture(state:string){
  if(!process.env.DRIP_INSTALL_CAPTURE)return;
  await mkdir('docs/screenshots/install-task',{recursive:true});
  for(const [device,width] of [['mobile',390],['desktop',1280]] as const){
   await page.setViewportSize({width,height:1000});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`docs/screenshots/install-task/${state}-${device}.png`,scale:'css'});
  }
 }
 await capture('pending');
 await task.getByRole('button',{name:"I've added Drip"}).click();
 await expect(page.getByRole('status').filter({hasText:'Install task complete'})).toBeVisible();
 await capture('complete');
 await expect(task).toHaveCount(0);
 await capture('finished');
 await page.reload();await unlock(page,code);
 await expect(page.getByRole('region',{name:'Account cards'})).toContainText('£3,000.00');
 await expect(task).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('drip-install-task-v1'))).toBe('complete');
});

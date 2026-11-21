import {expect,test} from "@playwright/test";
import {mkdir} from "node:fs/promises";
import {legacyAccount} from "./legacy-account-helpers";
import {releaseDebt,releaseSaver,releaseStock} from "../tests/saved-experience-fixtures";
test("unlocked user reviews private analytics and opens an account from a life play",async({page})=>{
 await legacyAccount(page,"analytics_demo",[releaseSaver(),releaseStock(),releaseStock({id:"isa-stock",balance:1000,taxWrapper:"stocks-shares-isa"}),releaseDebt()]);
 await page.getByRole("navigation",{name:"Main"}).getByRole("button",{name:"Insights"}).click();
 await expect(page.getByRole("heading",{name:"Financial overview"})).toBeVisible();
 await expect(page.getByRole("region",{name:"Financial overview"})).toContainText("£1,200.00");
 const charts=page.getByRole("region",{name:"Dashboard charts"});
 await expect(charts.getByRole("img",{name:/Estimated monthly income over the next 12 months/})).toBeVisible();
 await charts.getByRole("button",{name:"Pie"}).click();
 await expect(charts.getByRole("img",{name:/Asset mix totalling/})).toBeVisible();
 if(process.env.DRIP_UI_CAPTURE){await mkdir("docs/screenshots/account-analytics",{recursive:true});await page.screenshot({path:"docs/screenshots/account-analytics/analytics-pie-mobile.png",fullPage:true,scale:"css"});}
 await charts.getByRole("button",{name:"Line"}).click();
 await expect(page.getByRole("region",{name:"Potential life plays carousel"})).toBeVisible();
 if(process.env.DRIP_UI_CAPTURE){await mkdir("docs/screenshots/account-analytics",{recursive:true});await page.screenshot({path:"docs/screenshots/account-analytics/analytics-mobile.png",fullPage:true,scale:"css"});}
 await page.getByRole("button",{name:"Review card"}).click();
 await expect(page.locator(".bal")).toHaveText("£1,200.00");
});

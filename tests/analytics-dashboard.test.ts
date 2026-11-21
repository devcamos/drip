import { describe,expect,it } from "vitest";
import { analyticsDashboardModel } from "../lib/analytics-dashboard";
import { archiveAccount } from "../lib/account-lifecycle";
import { releaseDebt,releaseSaver,releaseStock } from "./saved-experience-fixtures";
describe("private analytics dashboard",()=>{
 const today="2026-11-19";
 it("separates assets, debt, dividends and explicit ISA wrappers",()=>{
  const m=analyticsDashboardModel([releaseSaver({productCategory:"cash-isa"}),releaseStock({taxWrapper:"stocks-shares-isa"}),releaseDebt()],today);
  expect(m.totals).toEqual({assets:7500,debt:1200,dividends:2500,isas:7500});
 });
 it("excludes archived balances and receipts",()=>{
  const m=analyticsDashboardModel([archiveAccount(releaseSaver({balance:99000}))],today);
  expect(m.totals.assets).toBe(0);expect(m.income.monthlyEstimate).toBe(0);
 });
 it("keeps receipts separate from forecasts and excludes expected or future payouts",()=>{
  const a=releaseStock({payouts:[{date:today,amount:12,kind:"actual",incomeType:"dividend"},{date:today,amount:90,kind:"expected",incomeType:"dividend"},{date:"2026-11-20",amount:3,kind:"actual",incomeType:"dividend"}]});
  const m=analyticsDashboardModel([a],today);expect(m.income.dividendReceivedThisMonth).toBe(12);expect(m.income.receivedThisMonth).toBe(12);
 });
 it("labels an APR/AER gap only with valid positive rates",()=>{
  const m=analyticsDashboardModel([releaseDebt(),releaseSaver()],today);
  expect(m.rateComparison?.gap).toBeGreaterThan(0);expect(analyticsDashboardModel([],today).rateComparison).toBeNull();
 });
 it("aggregates multiple debts and holdings while keeping overlapping ISA totals clear",()=>{
  const secondDebt=releaseDebt({id:"credit-2",balance:300});
  const secondStock=releaseStock({id:"stock-2",balance:800,taxWrapper:"stocks-shares-isa"});
  const m=analyticsDashboardModel([releaseDebt(),secondDebt,releaseStock(),secondStock],today);
  expect(m.totals.debt).toBe(1500);expect(m.totals.dividends).toBe(3300);expect(m.totals.isas).toBe(800);
  expect(m.counts).toEqual({assets:2,debt:2,dividends:2,isas:1});
 });
 it("does not show a rate comparison when the best saver rate matches or exceeds card APR",()=>{
  expect(analyticsDashboardModel([releaseDebt({creditCard:{apr:4.1,minimumPayment:35}}),releaseSaver()],today).rateComparison).toBeNull();
  expect(analyticsDashboardModel([releaseDebt({creditCard:{apr:3,minimumPayment:35}}),releaseSaver()],today).rateComparison).toBeNull();
 });
 it("chooses the highest recorded APR and savings rate for its informational comparison",()=>{
  const highApr=releaseDebt({id:"credit-2",provider:"Lloyds",creditCard:{apr:30,minimumPayment:20}});
  const highAER=releaseSaver({id:"cash-2",provider:"Lloyds",ratePct:5});
  const m=analyticsDashboardModel([releaseDebt(),highApr,releaseSaver(),highAER],today);
  expect(m.rateComparison?.card).toBe(highApr);expect(m.rateComparison?.saver).toBe(highAER);expect(m.rateComparison?.gap).toBe(25);
 });
});

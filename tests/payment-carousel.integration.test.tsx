// @vitest-environment jsdom
import {fireEvent,render,screen,within} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {AccountsHome} from "../app/accounts/AccountsHome";
import {portfolioTotals} from "../lib/credit-card";
import {releaseDebt,releaseSaver} from "./saved-experience-fixtures";
it("shows payment plans and the next three months, linking an occurrence to the full calendar",()=>{
 const accounts=[releaseSaver(),releaseDebt()],onPayments=vi.fn();
 render(<AccountsHome accounts={accounts} totals={portfolioTotals(accounts)} creditPlans={[{accountId:"credit",name:"Barclaycard",apr:24.9,minimumPayment:35,plannedPayment:75,paymentDate:"2026-11-20"}]} incomePeriod="month" onIncomePeriod={vi.fn()} onAdd={vi.fn()} onOpen={vi.fn()} onPortfolio={vi.fn()} today="2026-11-19" onPayments={onPayments}/>);
 expect(screen.getByRole("region",{name:"Payment plans carousel"})).toHaveTextContent("Minimum payment due");
 const upcoming=screen.getByRole("region",{name:"Upcoming payments carousel"});
 expect(screen.getByText("NEXT 3 MONTHS")).toBeVisible();expect(within(upcoming).getAllByRole("button").length).toBeGreaterThan(0);
 fireEvent.click(within(upcoming).getAllByRole("button")[0]);expect(onPayments).toHaveBeenCalledOnce();
});

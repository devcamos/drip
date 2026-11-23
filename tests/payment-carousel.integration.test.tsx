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
it("shows payments due today in the three-month carousel and opens the full calendar",()=>{
 const today="2026-11-20",cash=releaseSaver({nextPayoutDate:today}),debt=releaseDebt({nextPayoutDate:today}),accounts=[cash,debt],onPayments=vi.fn();
 render(<AccountsHome accounts={accounts} totals={portfolioTotals(accounts)} creditPlans={[{accountId:"credit",name:"Barclaycard",apr:24.9,minimumPayment:35,paymentDate:today}]} incomePeriod="month" onIncomePeriod={vi.fn()} onAdd={vi.fn()} onOpen={vi.fn()} onPortfolio={vi.fn()} today={today} onPayments={onPayments}/>);
 const upcoming=screen.getByRole("region",{name:"Upcoming payments carousel"});
 const cashDue=within(upcoming).getByRole("button",{name:/Open payment calendar: Zopa, .* on 20 Nov 2026/});
 const cardDue=within(upcoming).getByRole("button",{name:/Open payment calendar: Barclaycard, £75\.00 on 20 Nov 2026/});
 expect(cashDue).toHaveTextContent("Due today");expect(cardDue).toHaveTextContent("Due today");
 fireEvent.click(cashDue);expect(onPayments).toHaveBeenCalledOnce();
 expect(within(upcoming).getAllByRole("button").filter(button=>button.textContent?.includes("Due today"))).toHaveLength(2);
});

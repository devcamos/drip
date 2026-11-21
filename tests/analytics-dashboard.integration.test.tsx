// @vitest-environment jsdom
import {fireEvent,render,screen,within} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {AnalyticsDashboard} from "../app/AnalyticsDashboard";
import {releaseDebt,releaseSaver,releaseStock} from "./saved-experience-fixtures";
it("renders device-local summary and navigable, labelled life-play carousel",()=>{
 const onOpen=vi.fn();const {container}=render(<AnalyticsDashboard today="2026-11-19" accounts={[releaseSaver(),releaseStock(),releaseStock({id:"isa-stock",balance:1000,taxWrapper:"stocks-shares-isa"}),releaseDebt()]} onOpen={onOpen}/>);
 expect(screen.getByRole("heading",{name:"Financial overview"})).toBeVisible();
 const carousel=screen.getByRole("region",{name:"Potential life plays carousel"});
 expect(within(carousel).getByRole("group",{name:"1 of 2: Compare your rates"})).toBeVisible();
 expect(within(carousel).getByRole("group",{name:"2 of 2: Review dividend income"})).toBeVisible();
 const chartPanel=screen.getByRole("region",{name:"Dashboard charts"});
 expect(within(chartPanel).getByRole("button",{name:"Line"})).toHaveAttribute("aria-pressed","true");
 expect(within(chartPanel).getByRole("img",{name:/Estimated monthly income over the next 12 months/})).toBeVisible();
 expect(within(chartPanel).getByLabelText("Monthly estimate values")).toHaveTextContent("Dec");
 fireEvent.click(within(chartPanel).getByRole("button",{name:"Pie"}));
 expect(within(chartPanel).getByRole("button",{name:"Pie"})).toHaveAttribute("aria-pressed","true");
 expect(within(chartPanel).getByRole("img",{name:/Asset mix totalling £8,500.00/})).toBeVisible();
 expect(within(chartPanel).getByText("ISAs")).toBeVisible();
 expect(within(chartPanel).getByText("Dividends outside ISAs")).toBeVisible();
 expect(within(chartPanel).queryByText("Debt")).toBeNull();
 Object.defineProperty(carousel,"scrollBy",{value:vi.fn(),configurable:true});
 fireEvent.click(screen.getByRole("button",{name:"Next life play"}));
 fireEvent.click(screen.getByRole("button",{name:"Review card"}));expect(onOpen).toHaveBeenCalledWith("credit");
 expect(container.textContent).toContain("not sent to analytics");
});

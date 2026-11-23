import { describe, expect, it } from "vitest";
import { accountReviewDueDate, accountReviewFields, accountsNeedingReview, confirmAccountFiguresReviewed, validAccountReviewFields } from "../lib/account-review";
import { releaseDebt, releaseSaver } from "./saved-experience-fixtures";

describe("account figure review reminders", () => {
  it("treats legacy accounts without review dates as due", () => {
    const fields = accountReviewFields(releaseSaver(), "2026-11-22");
    expect(fields.map(field => [field.label, field.due])).toEqual([["Balance", true], ["Interest rate", true], ["Expected payment date", true]]);
  });

  it("uses a simple 30-day window and stays current up to the due date", () => {
    expect(accountReviewDueDate("2026-11-01")).toBe("2026-12-01");
    expect(accountReviewFields(releaseSaver({ balanceReviewedAt: "2026-11-01", rateReviewedAt: "2026-11-01", paymentDateReviewedAt: "2026-11-01" }), "2026-11-30").every(field => !field.due)).toBe(true);
  });

  it("flags each figure on the exact due day independently", () => {
    const account = releaseSaver({ balanceReviewedAt: "2026-11-01", rateReviewedAt: "2026-10-01", paymentDateReviewedAt: "2026-11-01" });
    expect(accountsNeedingReview([account], "2026-11-22")[0].fields.map(field => field.key)).toEqual(["rateReviewedAt"]);
  });

  it("treats malformed stored dates as due rather than suppressing a reminder", () => {
    const fields = accountReviewFields(releaseSaver({ rateReviewedAt: "2026-02-30" }), "2026-11-22");
    expect(fields.find(field => field.key === "rateReviewedAt")).toMatchObject({ due: true, dueDate: undefined });
    expect(validAccountReviewFields(releaseSaver({ rateReviewedAt: "2026-02-30" }))).toBe(false);
  });

  it("omits a payment date from accounts whose income is daily", () => {
    const fields = accountReviewFields(releaseSaver({ frequency: "daily" }), "2026-11-22");
    expect(fields.map(field => field.key)).toEqual(["balanceReviewedAt", "rateReviewedAt"]);
  });

  it("labels the credit rate as APR and uses the statement due date", () => {
    expect(accountReviewFields(releaseDebt(), "2026-11-22").map(field => field.label)).toEqual(["Balance", "APR", "Payment due date"]);
  });

  it("confirms current figures without changing financial values and clears their task", () => {
    const account = releaseDebt({ balanceReviewedAt: "2026-10-01", rateReviewedAt: "2026-10-01", paymentDateReviewedAt: "2026-10-01" });
    const reviewed = confirmAccountFiguresReviewed(account, "2026-11-22");
    expect(reviewed).toMatchObject({ balance: account.balance, ratePct: account.ratePct, nextPayoutDate: account.nextPayoutDate, balanceReviewedAt: "2026-11-22", rateReviewedAt: "2026-11-22", paymentDateReviewedAt: "2026-11-22" });
    expect(accountsNeedingReview([reviewed], "2026-11-22")).toEqual([]);
  });
});

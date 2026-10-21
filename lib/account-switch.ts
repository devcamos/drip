import type { RetainedAccount } from "./db";

export class AccountSwitchRequired extends Error {
  constructor(readonly retained: RetainedAccount, readonly canReplace: boolean) {
    super("Another account is saved in this browser.");
    this.name = "AccountSwitchRequired";
  }
}

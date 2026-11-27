import { describe, expect, it } from "vitest";
import { isReservedHandle } from "../lib/identity";

describe("profile gamertag reservation policy", () => {
  it.each(["admin", "ADMIN", "Admin", "drip", "DRIP", "support"])("blocks reserved name %s without regard to capitalization", name => {
    expect(isReservedHandle(name)).toBe(true);
  });
  it.each(["admin1", "admin_2", "drip_user", "support1", "riverbank"])("allows non-reserved name %s", name => {
    expect(isReservedHandle(name)).toBe(false);
  });
});

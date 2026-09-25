import { describe, expect, it } from "vite-plus/test";

import { resolveSidebarRowVariant } from "./SidebarProjectPicker";

describe("resolveSidebarRowVariant", () => {
  it("renders live threads as cards when comfortable", () => {
    expect(resolveSidebarRowVariant("active", "comfortable")).toBe("card");
    expect(resolveSidebarRowVariant("pinned", "comfortable")).toBe("card");
  });

  it("renders every row slim when compact", () => {
    expect(resolveSidebarRowVariant("active", "compact")).toBe("slim");
    expect(resolveSidebarRowVariant("pinned", "compact")).toBe("slim");
  });

  it("keeps settled and snoozed rows slim in both densities", () => {
    expect(resolveSidebarRowVariant("settled", "comfortable")).toBe("slim");
    expect(resolveSidebarRowVariant("snoozed", "comfortable")).toBe("slim");
    expect(resolveSidebarRowVariant("settled", "compact")).toBe("slim");
    expect(resolveSidebarRowVariant("snoozed", "compact")).toBe("slim");
  });
});

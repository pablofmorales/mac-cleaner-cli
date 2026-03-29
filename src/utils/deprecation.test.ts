import { describe, it, expect, vi } from "vitest";
import { emitDeprecation } from "./deprecation.js";

describe("emitDeprecation", () => {
  it("prints a warning to stderr with old and new command", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    emitDeprecation("system", "cleanup system");
    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("system");
    expect(output).toContain("cleanup system");
    spy.mockRestore();
  });

  it("does not print when MAC_CLEANER_NO_DEPRECATION is set", () => {
    process.env.MAC_CLEANER_NO_DEPRECATION = "1";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    emitDeprecation("system", "cleanup system");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    delete process.env.MAC_CLEANER_NO_DEPRECATION;
  });
});

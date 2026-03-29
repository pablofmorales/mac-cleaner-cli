import { describe, it, expect } from "vitest";
import { getTerminalInfo } from "./detect.js";

describe("detect", () => {
  it("returns terminal info object", () => {
    const info = getTerminalInfo();
    expect(info).toHaveProperty("cols");
    expect(info).toHaveProperty("rows");
    expect(info).toHaveProperty("isTTY");
    expect(info).toHaveProperty("colorDepth");
    expect(typeof info.cols).toBe("number");
    expect(typeof info.rows).toBe("number");
  });

  it("detects minimum size requirement", () => {
    const info = getTerminalInfo();
    expect(typeof info.isTooSmall).toBe("boolean");
  });
});

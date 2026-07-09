import { describe, expect, it } from "vitest";
import { isBlockedRequestUrl } from "./render-page";

describe("isBlockedRequestUrl", () => {
  it("blocks private browser subresource targets", async () => {
    await expect(isBlockedRequestUrl("http://localhost/logo.png")).resolves.toBe(true);
    await expect(isBlockedRequestUrl("http://127.0.0.1/logo.png")).resolves.toBe(true);
    await expect(isBlockedRequestUrl("http://169.254.169.254/latest/meta-data/")).resolves.toBe(true);
    await expect(isBlockedRequestUrl("data:image/png;base64,AA==")).resolves.toBe(false);
  });
});

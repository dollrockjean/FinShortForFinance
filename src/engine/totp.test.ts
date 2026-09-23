import { describe, expect, it } from "vitest";
import { randomSecret, totp, verifyTotp } from "./totp";

// RFC 6238 appendix B, SHA-1 key "12345678901234567890" in base32, truncated to 6 digits
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it("matches the RFC 6238 test vectors", async () => {
    expect(await totp(RFC_SECRET, 59_000)).toBe("287082");
    expect(await totp(RFC_SECRET, 1_111_111_109_000)).toBe("081804");
    expect(await totp(RFC_SECRET, 1_234_567_890_000)).toBe("005924");
    expect(await totp(RFC_SECRET, 2_000_000_000_000)).toBe("279037");
  });

  it("accepts one step of drift and rejects the rest", async () => {
    const s = randomSecret();
    const now = 1_700_000_000_000;
    expect(await verifyTotp(s, await totp(s, now - 30_000), now)).toBe(true);
    expect(await verifyTotp(s, await totp(s, now - 90_000), now)).toBe(false);
  });
});

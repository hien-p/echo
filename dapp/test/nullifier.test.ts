import { describe, expect, it } from "vitest";
import { canonicalMessage, deriveCommitment } from "../src/lib/echo/nullifier";

describe("nullifier", () => {
  it("canonicalMessage normalizes 0x prefix and case", () => {
    const a = canonicalMessage(
      "0xABC",
      "0xDEFa1ce5cb9f3e3ed8c9f1ac5a59c7e8c1f96f3a8b9c2d4e5a6b7c8d9e0f1a2b",
    );
    const b = canonicalMessage(
      "abc",
      "0xdefa1ce5cb9f3e3ed8c9f1ac5a59c7e8c1f96f3a8b9c2d4e5a6b7c8d9e0f1a2b",
    );
    expect(a).toBe(b);
    expect(a).toMatch(/form=0xabc/);
    expect(a).toMatch(/address=0xdefa1ce5/);
  });

  it("canonicalMessage scopes by form id", () => {
    const a = canonicalMessage("0xform1", "0xwallet");
    const b = canonicalMessage("0xform2", "0xwallet");
    expect(a).not.toBe(b);
  });

  it("deriveCommitment returns 32 bytes", async () => {
    const fakeSigner = {
      async signPersonalMessage() {
        // Constant signature for predictability.
        return {
          signature: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIj",
        };
      },
    };
    const out = await deriveCommitment({
      formId: "0x123",
      walletAddress: "0xabc",
      signer: fakeSigner,
    });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(32);
  });

  it("deriveCommitment is deterministic given the same signature", async () => {
    const sig = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIj";
    const fakeSigner = {
      async signPersonalMessage() {
        return { signature: sig };
      },
    };
    const a = await deriveCommitment({
      formId: "0x1",
      walletAddress: "0x2",
      signer: fakeSigner,
    });
    const b = await deriveCommitment({
      formId: "0x1",
      walletAddress: "0x2",
      signer: fakeSigner,
    });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("deriveCommitment differs across distinct signatures", async () => {
    let i = 0;
    const fakeSigner = {
      async signPersonalMessage() {
        i++;
        return {
          signature:
            i === 1
              ? "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIj"
              : "/////////////////////////////////////////////w==",
        };
      },
    };
    const a = await deriveCommitment({
      formId: "0x1",
      walletAddress: "0x2",
      signer: fakeSigner,
    });
    const b = await deriveCommitment({
      formId: "0x1",
      walletAddress: "0x2",
      signer: fakeSigner,
    });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

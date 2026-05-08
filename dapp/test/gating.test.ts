import { describe, expect, it } from "vitest";
import { checkGating } from "../src/lib/echo/gating";
import type { FormSchema } from "../src/lib/echo/types";

const baseSchema: FormSchema = {
  version: 1,
  fields: [],
};

const fakeClient = (overrides: { balance?: string; ownedCount?: number }) => ({
  async getBalance() {
    return { totalBalance: overrides.balance ?? "0" };
  },
  async listOwnedObjects() {
    return { objects: new Array(overrides.ownedCount ?? 0).fill({}) };
  },
});

describe("checkGating", () => {
  it("returns ok when gating is undefined", async () => {
    const r = await checkGating(baseSchema, "0xabc", fakeClient({}));
    expect(r.ok).toBe(true);
  });

  it("returns ok when wallet is undefined (no wallet to check)", async () => {
    const schema: FormSchema = {
      ...baseSchema,
      gating: { type: "token", coinType: "0x2::sui::SUI", minAmount: "1" },
    };
    const r = await checkGating(schema, undefined, fakeClient({}));
    expect(r.ok).toBe(true);
  });

  it("token: denies when balance below min", async () => {
    const schema: FormSchema = {
      ...baseSchema,
      gating: { type: "token", coinType: "0x2::sui::SUI", minAmount: "100" },
    };
    const r = await checkGating(schema, "0xabc", fakeClient({ balance: "50" }));
    expect(r.ok).toBe(false);
    expect(r.predicate).toBe("token");
    expect(r.reason).toMatch(/Requires/);
  });

  it("token: allows when balance ≥ min", async () => {
    const schema: FormSchema = {
      ...baseSchema,
      gating: { type: "token", coinType: "0x2::sui::SUI", minAmount: "100" },
    };
    const r = await checkGating(
      schema,
      "0xabc",
      fakeClient({ balance: "100" }),
    );
    expect(r.ok).toBe(true);
    expect(r.predicate).toBe("token");
  });

  it("nft: denies when no owned NFT of the type", async () => {
    const schema: FormSchema = {
      ...baseSchema,
      gating: { type: "nft", nftType: "0xPKG::shrimp::Shrimp" },
    };
    const r = await checkGating(schema, "0xabc", fakeClient({ ownedCount: 0 }));
    expect(r.ok).toBe(false);
    expect(r.predicate).toBe("nft");
  });

  it("nft: allows when at least one is owned", async () => {
    const schema: FormSchema = {
      ...baseSchema,
      gating: { type: "nft", nftType: "0xPKG::shrimp::Shrimp" },
    };
    const r = await checkGating(schema, "0xabc", fakeClient({ ownedCount: 1 }));
    expect(r.ok).toBe(true);
  });

  it("malformed gating (token without coinType) falls through to ok", async () => {
    const schema = {
      ...baseSchema,
      gating: { type: "token" as const },
    };
    const r = await checkGating(schema, "0xabc", fakeClient({}));
    expect(r.ok).toBe(true);
  });
});

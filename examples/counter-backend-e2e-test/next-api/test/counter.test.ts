import { SuiClient, TransactionEffects } from "@mysten/sui/client";
import { NextResponse } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

const DUMMY_BASE_URL = "http://test";

describe.sequential("Counter API - Integration Tests", () => {
  let counter = 0;
  let suiClient: SuiClient;
  let GET: (request: Request) => Promise<NextResponse<{ value: number }>>;
  let POST: (
    request: Request,
  ) => Promise<
    NextResponse<
      | { success: boolean; digest: string }
      | { effects: TransactionEffects | null | undefined }
    >
  >;

  beforeAll(async () => {
    ({ suiClient } = await import("../src/app/api/suiClient"));
    ({ GET } = await import("../src/app/api/counter/route"));
    ({ POST } = await import("../src/app/api/increment/route"));
  });

  it("reads the counter value", async () => {
    const res = await GET(new Request(DUMMY_BASE_URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("value");
    expect(body.value).toBeTypeOf("number");
    expect(body.value).toBeGreaterThanOrEqual(0);
    counter = body.value;
  });

  it("increments the counter value", async () => {
    const res = await POST(new Request(DUMMY_BASE_URL, { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("digest");
    expect(body.digest).toBeTypeOf("string");
    const digest = body.digest;
    await suiClient.waitForTransaction({
      digest,
      options: { showEffects: true },
    });
  });

  it("reads the incremented counter value", async () => {
    const res = await GET(new Request(DUMMY_BASE_URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("value");
    expect(body.value).toBeTypeOf("number");
    expect(body.value).toBe(counter + 1);
  });
});

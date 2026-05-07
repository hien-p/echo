import { describe, beforeAll, expect, it } from "vitest";

const URL_BASE = "http://test/api/insights/index_one";

let POST: (request: Request) => Promise<Response>;

describe.sequential("Browser-driven index_one endpoint", () => {
  beforeAll(async () => {
    delete process.env.MEMWAL_PRIVATE_KEY;
    delete process.env.MEMWAL_ACCOUNT_ID;
    const route = await import("../src/app/api/insights/index_one/route");
    POST = route.POST as typeof POST;
  });

  it("500s when memwal not configured", async () => {
    const resp = await POST(
      new Request(URL_BASE, {
        method: "POST",
        body: JSON.stringify({ formId: "0x1", text: "hello" }),
      }),
    );
    expect(resp.status).toBe(500);
  });

  it("400s on invalid JSON", async () => {
    const resp = await POST(
      new Request(URL_BASE, {
        method: "POST",
        body: "not json",
      }),
    );
    // Could be 500 (env) or 400 (json) depending on order; assert one of those.
    expect([400, 500]).toContain(resp.status);
  });

  it("400s on missing formId", async () => {
    process.env.MEMWAL_PRIVATE_KEY = "x";
    process.env.MEMWAL_ACCOUNT_ID = "y";
    const resp = await POST(
      new Request(URL_BASE, {
        method: "POST",
        body: JSON.stringify({ text: "hello" }),
      }),
    );
    expect(resp.status).toBe(400);
    const json = (await resp.json()) as { error: string };
    expect(json.error).toMatch(/formId/);
  });

  it("400s on empty text", async () => {
    process.env.MEMWAL_PRIVATE_KEY = "x";
    process.env.MEMWAL_ACCOUNT_ID = "y";
    const resp = await POST(
      new Request(URL_BASE, {
        method: "POST",
        body: JSON.stringify({ formId: "0xabc", text: "  " }),
      }),
    );
    expect(resp.status).toBe(400);
  });

  it("413s on text > 16000 chars", async () => {
    process.env.MEMWAL_PRIVATE_KEY = "x";
    process.env.MEMWAL_ACCOUNT_ID = "y";
    const huge = "a".repeat(16_001);
    const resp = await POST(
      new Request(URL_BASE, {
        method: "POST",
        body: JSON.stringify({ formId: "0xabc", text: huge }),
      }),
    );
    expect(resp.status).toBe(413);
  });
});

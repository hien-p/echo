import { describe, beforeAll, expect, it } from "vitest";

const URL_BASE = "http://test/api/demo/admin";

let POST: (
  request: Request,
  ctx: { params: Promise<{ slug?: string[] }> },
) => Promise<Response>;

describe.sequential("Demo admin endpoints", () => {
  beforeAll(async () => {
    // Module reads NEXT_PUBLIC_DEMO_ADMIN_ADDRESS at import time, so unset
    // here to assert the disabled-by-default path.
    delete process.env.DEMO_ADMIN_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_DEMO_ADMIN_ADDRESS;
    const route = await import("../src/app/api/demo/admin/[...slug]/route");
    POST = route.POST as typeof POST;
  });

  it("404s for unknown action slug", async () => {
    const resp = await POST(
      new Request(`${URL_BASE}/whatever`, {
        method: "POST",
        body: JSON.stringify({ formId: "0x1" }),
      }),
      { params: Promise.resolve({ slug: ["whatever"] }) },
    );
    expect(resp.status).toBe(404);
  });

  it("503s on list when demo mode env vars are missing", async () => {
    const resp = await POST(
      new Request(`${URL_BASE}/list`, {
        method: "POST",
        body: JSON.stringify({ formId: "0x1" }),
      }),
      { params: Promise.resolve({ slug: ["list"] }) },
    );
    expect(resp.status).toBe(503);
    const json = (await resp.json()) as { error: string };
    expect(json.error).toMatch(/Demo admin mode disabled/);
  });

  it("503s on decrypt when demo mode env vars are missing", async () => {
    const resp = await POST(
      new Request(`${URL_BASE}/decrypt`, {
        method: "POST",
        body: JSON.stringify({
          formId: "0x1",
          submissionId: "0x2",
          payloadBlobId: "blob",
        }),
      }),
      { params: Promise.resolve({ slug: ["decrypt"] }) },
    );
    expect(resp.status).toBe(503);
  });
});

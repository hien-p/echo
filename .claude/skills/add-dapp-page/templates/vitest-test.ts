import { beforeAll, describe, expect, it } from "vitest";

const DUMMY_BASE_URL = "http://test";
let GET: (request: Request) => Promise<Response>;

describe.sequential("Feature API", () => {
  beforeAll(async () => {
    const route = await import("../src/app/api/feature/route");
    GET = route.GET;
  });

  it("returns a successful response", async () => {
    const response = await GET(new Request(DUMMY_BASE_URL));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
    });
  });

  it("returns a client error for invalid input", async () => {
    const response = await GET(new Request(`${DUMMY_BASE_URL}?invalid=true`));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

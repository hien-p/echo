import { NextResponse } from "next/server";
import { describe, beforeAll, expect, it } from "vitest";

const DUMMY_BASE_URL = "http://test";
let GET: (request: Request) => NextResponse<{ message: string }>;

describe.sequential("Health Check Endpoint", () => {
  beforeAll(async () => {
    const route = await import("../src/app/api/health/route");
    GET = route.GET;
  });
  it("should return status 200", async () => {
    const response = await GET(new Request(DUMMY_BASE_URL));
    expect(response.status).toBe(200);
  });
});

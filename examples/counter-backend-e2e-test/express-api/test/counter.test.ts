import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { suiClient } from "../src/suiClient";

describe.sequential("Counter API - Integration Tests", () => {
  let counter = 0;
  let app: any;

  beforeAll(async () => {
    ({ app } = await import("../src"));
  });

  it("reads the counter value", async () => {
    const res = await request(app).get("/counter");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("value");
    expect(res.body.value).toBeTypeOf("number");
    expect(res.body.value).toBeGreaterThanOrEqual(0);
    counter = res.body.value;
  });

  it("increments the counter value", async () => {
    const res2 = await request(app).post("/increment");
    expect(res2.status).toBe(200);
    expect(res2.body).toHaveProperty("success", true);
    expect(res2.body).toHaveProperty("digest");
    expect(res2.body.digest).toBeTypeOf("string");
    const digest = res2.body.digest;
    await suiClient.waitForTransaction({
      digest,
      options: { showEffects: true },
    });
  });

  it("reads the incremented counter value", async () => {
    const res3 = await request(app).get("/counter");
    expect(res3.status).toBe(200);
    expect(res3.body).toHaveProperty("value");
    expect(res3.body.value).toBeTypeOf("number");
    expect(res3.body.value).toBe(counter + 1);
  });
});

import { describe, it, expect, inject } from "vitest";

describe("e2e flow", () => {
  let packageId: string;

  it("Should have published the package", async () => {
    const objectChanges = inject("objectChanges");
    const publishedChange = objectChanges.find(
      ({ outputState }) => outputState === "PackageWrite",
    );
    expect(publishedChange).toBeDefined();
    packageId = publishedChange!.objectId;
  });
});

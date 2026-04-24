import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureName } from "@/components/general/FeatureName";

export const metadata: Metadata = {
  title: "Feature Name",
};

async function FeatureAsyncSection() {
  return <div>{/* Render server-fetched data here. */}</div>;
}

export default function FeaturePage() {
  return (
    <section className="flex flex-col gap-sm">
      <FeatureName packageId="<validated-package-id>" />
      <Suspense fallback={<div>Loading...</div>}>
        <FeatureAsyncSection />
      </Suspense>
    </section>
  );
}

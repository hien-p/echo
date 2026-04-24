import type { Metadata } from "next";
import { FeatureName } from "@/components/general/FeatureName";

export const metadata: Metadata = {
  title: "Feature Name",
};

export default function FeaturePage() {
  return (
    <section className="flex flex-col gap-sm">
      <FeatureName packageId="<validated-package-id>" />
    </section>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import { FormList } from "./FormListClient";

export const metadata: Metadata = {
  title: "My forms · Echo",
  description: "Forms you own on Echo.",
};

export default function FormsListPage() {
  return (
    <AppShell
      kicker="Forms"
      title="My forms"
      subtitle="Forms you hold a FormOwnerCap for. Click any to open the admin view."
      width="narrow"
    >
      <FormList />
    </AppShell>
  );
}

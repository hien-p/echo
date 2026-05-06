import type { Metadata } from "next";
import { FormList } from "./FormListClient";

export const metadata: Metadata = {
  title: "My forms · Echo",
  description: "Forms you own on Echo.",
};

export default function FormsListPage() {
  return (
    <section className="flex flex-col gap-md max-w-[768px] mx-auto p-md w-full">
      <header>
        <h1 className="text-2xl font-semibold">My forms</h1>
        <p className="text-sm text-muted-foreground">
          Forms you have a FormOwnerCap for. Click any to open the admin view.
        </p>
      </header>
      <FormList />
    </section>
  );
}

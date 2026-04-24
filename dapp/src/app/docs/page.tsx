import { notFound } from "next/navigation";
import SwaggerUIClient from "./swagger-ui-client";

export default function ApiDocs() {
  // Only allow access in development mode
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <SwaggerUIClient />;
}

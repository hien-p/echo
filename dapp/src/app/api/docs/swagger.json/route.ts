import { NextResponse } from "next/server";

export const runtime = "edge";

// swagger-jsdoc is dev-only because it scans the filesystem.
// On production / Cloudflare Pages we stub a 404 to keep the bundle edge-safe.
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }
  const { swaggerSpec } = await import("@/lib/swagger");
  return NextResponse.json(swaggerSpec);
}

import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const TESTNET_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ??
  "https://aggregator.walrus-testnet.walrus.space";
const MAINNET_AGGREGATOR = "https://aggregator.walrus.atalma.io";

function aggregatorBase(): string {
  return process.env.NEXT_PUBLIC_WALRUS_NETWORK === "mainnet"
    ? MAINNET_AGGREGATOR
    : TESTNET_AGGREGATOR;
}

/**
 * Walrus aggregator read-proxy for images embedded in respondent rich-text
 * answers.
 *
 * The Walrus testnet/mainnet aggregators serve blob bytes with
 * `x-content-type-options: nosniff` AND no `content-type` header. Chrome
 * (and any browser respecting nosniff) refuses to render those bytes
 * inside an <img> tag — they're treated as application/octet-stream and
 * the element silently fails. This proxy fetches the blob, sniffs the
 * magic bytes for common image formats, and re-emits the response with
 * the correct content-type so <img src="/api/walrus/blob/<id>"> works.
 *
 * Read-only, blob-id whitelisted to base64url shape so it can't be
 * abused as a generic open proxy.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ blobId: string }> },
) {
  const { blobId } = await params;
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(blobId)) {
    return NextResponse.json({ error: "invalid blob id" }, { status: 400 });
  }

  const target = `${aggregatorBase()}/v1/blobs/${blobId}`;
  let upstream: Response;
  try {
    upstream = await fetch(target);
  } catch (err) {
    return NextResponse.json(
      {
        error: `aggregator fetch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `aggregator HTTP ${upstream.status}` },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  const contentType =
    sniffMime(new Uint8Array(buf, 0, Math.min(16, buf.byteLength))) ??
    "application/octet-stream";

  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": contentType,
      // Walrus blobs are content-addressed by id, so they're immutable —
      // browsers can cache forever.
      "cache-control": "public, max-age=31536000, immutable",
      // Allow the blob to load cross-origin (Walrus Sites build serves
      // from a different host than this proxy).
      "access-control-allow-origin": "*",
    },
  });
}

function sniffMime(b: Uint8Array): string | null {
  if (
    b.length >= 4 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  )
    return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return "image/jpeg";
  if (
    b.length >= 6 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38
  )
    return "image/gif";
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  if (
    b.length >= 4 &&
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46
  )
    return "application/pdf";
  if (
    b.length >= 4 &&
    b[0] === 0x00 &&
    b[1] === 0x00 &&
    b[2] === 0x00 &&
    b[3] === 0x18
  )
    return "video/mp4";
  return null;
}

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
    sniffMime(new Uint8Array(buf, 0, Math.min(32, buf.byteLength))) ??
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
  // Images
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
  // RIFF container — WEBP at offset 8 == "WEBP", AVI == "AVI ", WAV == "WAVE"
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46
  ) {
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
      return "image/webp";
    if (b[8] === 0x41 && b[9] === 0x56 && b[10] === 0x49 && b[11] === 0x20)
      return "video/x-msvideo";
    if (b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45)
      return "audio/wav";
  }
  // ISOBMFF — bytes 4..7 == "ftyp"; brand at 8..11 disambiguates
  // mp4 / quicktime / heic / m4a etc. The previous narrow match (00 00
  // 00 18) only caught one specific size header and missed most real
  // mp4s, so videos uploaded by respondents were silently served as
  // octet-stream and failed to play.
  if (
    b.length >= 12 &&
    b[4] === 0x66 &&
    b[5] === 0x74 &&
    b[6] === 0x79 &&
    b[7] === 0x70
  ) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === "qt  ") return "video/quicktime";
    if (brand === "heic" || brand === "heix" || brand === "mif1")
      return "image/heic";
    if (brand.startsWith("M4A")) return "audio/mp4";
    return "video/mp4"; // mp4, mp42, isom, M4V, dash, …
  }
  // WEBM / Matroska — EBML magic 1A 45 DF A3
  if (
    b.length >= 4 &&
    b[0] === 0x1a &&
    b[1] === 0x45 &&
    b[2] === 0xdf &&
    b[3] === 0xa3
  )
    return "video/webm";
  // OGG container (theora/vorbis)
  if (
    b.length >= 4 &&
    b[0] === 0x4f &&
    b[1] === 0x67 &&
    b[2] === 0x67 &&
    b[3] === 0x53
  )
    return "video/ogg";
  // Documents
  if (
    b.length >= 4 &&
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46
  )
    return "application/pdf";
  return null;
}

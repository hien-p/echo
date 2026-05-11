import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const DEFAULT_PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
  "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_EPOCHS = 5;
// Cap at 50 MB. Cloudflare Workers themselves accept up to 100 MB request
// bodies, so this leaves headroom for Next.js framing while comfortably
// covering screenshots and short videos. Original 5 MB rejected most
// screen recordings out of the gate.
const MAX_BYTES = 50 * 1024 * 1024;

interface PublisherSuccess {
  newlyCreated?: {
    blobObject?: {
      id?: string;
      blobId?: string;
      storage?: { storageSize?: string };
    };
  };
  alreadyCertified?: {
    blobId?: string;
    endEpoch?: number;
  };
}

/**
 * Walrus publisher proxy.
 *
 * Browser POSTs raw bytes; we forward to a Walrus testnet publisher which
 * pays gas + handles register/upload/certify on the client's behalf.
 * Returns the new blob's id. End users (form authors and respondents) hit
 * this instead of WalrusClient.writeBlob so they never need SUI to upload.
 */
export async function POST(request: Request) {
  const lenHeader = request.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BYTES) {
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
    return NextResponse.json(
      {
        error: `Image too large for the upload proxy (${mb(Number(lenHeader))} > ${mb(MAX_BYTES)} cap). Compress or resize before re-uploading.`,
      },
      { status: 413 },
    );
  }

  const url = new URL(request.url);
  const epochs = Number(url.searchParams.get("epochs") ?? DEFAULT_EPOCHS);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty body." }, { status: 400 });
  }

  const target = `${DEFAULT_PUBLISHER}/v1/blobs?epochs=${epochs}`;
  let resp: Response;
  try {
    resp = await fetch(target, {
      method: "PUT",
      body: bytes,
      headers: { "content-type": "application/octet-stream" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Publisher fetch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return NextResponse.json(
      { error: `Publisher HTTP ${resp.status}`, body: body.slice(0, 200) },
      { status: 502 },
    );
  }
  const data = (await resp.json()) as PublisherSuccess;
  const blobId =
    data.newlyCreated?.blobObject?.blobId ?? data.alreadyCertified?.blobId;
  if (!blobId) {
    return NextResponse.json(
      { error: "Publisher response had no blob id", raw: data },
      { status: 502 },
    );
  }
  return NextResponse.json({ blobId });
}

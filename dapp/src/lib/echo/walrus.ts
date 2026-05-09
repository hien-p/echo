"use client";

/**
 * Walrus blob upload/download helpers.
 *
 * Wraps `@mysten/walrus` so callers don't have to think about encoding,
 * default epoch counts, or JSON serialization. Each helper takes a
 * pre-built `WalrusClient` and a `Signer` that the wallet supplies —
 * the SDK does not own the signer because dApp Kit needs to manage
 * sign-and-execute through the connected wallet.
 */

import {
  WalrusClient,
  type WalrusClientConfig,
  TESTNET_WALRUS_PACKAGE_CONFIG,
  MAINNET_WALRUS_PACKAGE_CONFIG,
} from "@mysten/walrus";
import type { Signer } from "@mysten/sui/cryptography";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { apiUrl } from "@/config/clientConfig";
import type { UploadResult } from "./types";

const DEFAULT_EPOCHS = 5;

/** Build a Walrus client targeting the configured network. */
export function getWalrusClient(
  suiClient: ClientWithCoreApi,
  network: "testnet" | "mainnet",
): WalrusClient {
  const packageConfig =
    network === "mainnet"
      ? MAINNET_WALRUS_PACKAGE_CONFIG
      : TESTNET_WALRUS_PACKAGE_CONFIG;

  const config: WalrusClientConfig = {
    network,
    packageConfig,
    suiClient,
  };
  return new WalrusClient(config);
}

/** Serialize JSON, upload as a Walrus blob, return the blob/object IDs. */
export async function uploadJsonBlob(
  client: WalrusClient,
  signer: Signer,
  data: unknown,
  opts?: { epochs?: number; deletable?: boolean },
): Promise<UploadResult> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const result = await client.writeBlob({
    blob: bytes,
    deletable: opts?.deletable ?? false,
    epochs: opts?.epochs ?? DEFAULT_EPOCHS,
    signer,
  });
  return { blobId: result.blobId, blobObjectId: result.blobObject.id };
}

/** Upload arbitrary binary content (files, encrypted Seal output, etc.). */
export async function uploadBytesBlob(
  client: WalrusClient,
  signer: Signer,
  bytes: Uint8Array,
  opts?: { epochs?: number; deletable?: boolean },
): Promise<UploadResult> {
  const result = await client.writeBlob({
    blob: bytes,
    deletable: opts?.deletable ?? false,
    epochs: opts?.epochs ?? DEFAULT_EPOCHS,
    signer,
  });
  return { blobId: result.blobId, blobObjectId: result.blobObject.id };
}

/**
 * Upload bytes through the /api/walrus/upload publisher proxy. Zero gas for
 * the caller — the publisher pays. Falls back to throwing on non-2xx so the
 * caller can surface the error.
 */
export async function uploadBytesViaPublisher(
  bytes: Uint8Array,
  opts?: { epochs?: number },
): Promise<{ blobId: string }> {
  const epochs = opts?.epochs ?? 5;
  const resp = await fetch(apiUrl(`/api/walrus/upload?epochs=${epochs}`), {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: new Blob([bytes as unknown as ArrayBuffer]),
  });
  const data = (await resp.json()) as { blobId?: string; error?: string };
  if (!resp.ok || !data.blobId) {
    throw new Error(data.error ?? `publisher HTTP ${resp.status}`);
  }
  return { blobId: data.blobId };
}

export async function uploadJsonViaPublisher(
  data: unknown,
  opts?: { epochs?: number },
): Promise<{ blobId: string }> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return uploadBytesViaPublisher(bytes, opts);
}

/** Read a JSON-encoded blob and parse it. */
export async function readJsonBlob<T = unknown>(
  client: WalrusClient,
  blobId: string,
): Promise<T> {
  const bytes = await client.readBlob({ blobId });
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function readBytesBlob(
  client: WalrusClient,
  blobId: string,
): Promise<Uint8Array> {
  return client.readBlob({ blobId });
}

// ===========================================================================
// Aggregator-based reads (FAST path).
//
// WalrusClient.readBlob spins up the wasm sliver-reconstruction client; for
// public blobs that ~5-10s warm-up is wasted work — the network already runs
// CDN-fronted aggregator HTTP endpoints that serve the reconstructed bytes
// over a single GET. Use these for schema/metadata/payload reads.
//
// Walrus blob IDs are content-addressed (BLAKE2b of contents), so they're
// immutable. We cache by id in localStorage forever — first hit ~200-500ms,
// repeat hits ~instant.
// ===========================================================================

const DEFAULT_TESTNET_AGGREGATORS = [
  "https://aggregator.walrus-testnet.walrus.space",
  "https://wal-aggregator-testnet.staketab.org",
  "https://walrus-testnet-aggregator.nodes.guru",
];
const DEFAULT_MAINNET_AGGREGATORS = [
  "https://aggregator.walrus.space",
  "https://wal-aggregator-mainnet.staketab.org",
];

function aggregatorList(network: "testnet" | "mainnet"): string[] {
  const env =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL
      : "";
  if (env)
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return network === "mainnet"
    ? DEFAULT_MAINNET_AGGREGATORS
    : DEFAULT_TESTNET_AGGREGATORS;
}

const CACHE_PREFIX = "echo:walrus:";
const CACHE_VERSION = "v1";

function cacheKey(blobId: string): string {
  return `${CACHE_PREFIX}${CACHE_VERSION}:${blobId}`;
}

function readCache(blobId: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(cacheKey(blobId));
  } catch {
    return null;
  }
}

function writeCache(blobId: string, base64: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(cacheKey(blobId), base64);
  } catch {
    // Quota exceeded — best-effort eviction of older entries.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
      }
      localStorage.setItem(cacheKey(blobId), base64);
    } catch {
      /* give up */
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return typeof btoa !== "undefined"
    ? btoa(s)
    : Buffer.from(bytes).toString("base64");
}
function base64ToBytes(s: string): Uint8Array {
  const bin =
    typeof atob !== "undefined"
      ? atob(s)
      : Buffer.from(s, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Read raw bytes for a blob via the public Walrus aggregator HTTP endpoint.
 * Tries each aggregator in turn until one succeeds. Result cached forever
 * (blobs are content-addressed, can't change).
 */
export async function readBytesViaAggregator(
  blobId: string,
  opts?: { network?: "testnet" | "mainnet"; signal?: AbortSignal },
): Promise<Uint8Array> {
  const cached = readCache(blobId);
  if (cached) return base64ToBytes(cached);

  const network = opts?.network ?? "testnet";
  const aggregators = aggregatorList(network);
  let lastErr: unknown = null;
  for (const base of aggregators) {
    try {
      const resp = await fetch(
        `${base.replace(/\/$/, "")}/v1/blobs/${blobId}`,
        { signal: opts?.signal },
      );
      if (!resp.ok) {
        lastErr = new Error(`${base} HTTP ${resp.status}`);
        continue;
      }
      const bytes = new Uint8Array(await resp.arrayBuffer());
      writeCache(blobId, bytesToBase64(bytes));
      return bytes;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `All aggregators failed for ${blobId}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

export async function readJsonViaAggregator<T = unknown>(
  blobId: string,
  opts?: { network?: "testnet" | "mainnet"; signal?: AbortSignal },
): Promise<T> {
  const bytes = await readBytesViaAggregator(blobId, opts);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

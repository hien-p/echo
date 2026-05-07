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
  const resp = await fetch(`/api/walrus/upload?epochs=${epochs}`, {
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

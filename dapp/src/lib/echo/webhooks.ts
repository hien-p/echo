/**
 * Per-form webhook configuration + dispatch.
 *
 * v0 stores the URL in localStorage (admin-side only) and fires the
 * POST from the admin's browser when their dashboard / admin panel
 * detects a new submission. This means webhooks ONLY fire while at
 * least one admin tab is open — fine for hackathon / demo, not for
 * production. v1 should store the URL on-chain on Form (mutable by
 * FormOwnerCap) and have a CF Worker tail submission events to fire
 * server-side, so a closed laptop doesn't drop webhook traffic.
 *
 * Payload shape mirrors what most chat-app webhooks accept:
 *   { event: "submission.created", form_id, submission_id,
 *     payload_blob_id, submitter, anonymous, ts }
 */

const KEY_PREFIX = "echo:webhook:";

export interface WebhookPayload {
  event: "submission.created" | "submission.test";
  form_id: string;
  submission_id: string;
  payload_blob_id: string;
  submitter: string | null;
  anonymous: boolean;
  ts: number;
}

export function getWebhookUrl(formId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_PREFIX + formId);
}

export function setWebhookUrl(formId: string, url: string): void {
  if (typeof window === "undefined") return;
  if (!url.trim()) {
    localStorage.removeItem(KEY_PREFIX + formId);
  } else {
    localStorage.setItem(KEY_PREFIX + formId, url.trim());
  }
}

/**
 * POST the payload to the configured URL. Returns the HTTP status, or
 * an error string if the fetch itself failed (network, CORS, etc).
 *
 * Most webhook receivers (Slack, Discord, generic CORS-friendly
 * endpoints) accept POST from a browser. CORS-strict endpoints will
 * reject; that's a tradeoff of the v0 client-side dispatch model.
 */
export async function dispatchWebhook(
  url: string,
  payload: WebhookPayload,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // Keep the request alive even if the admin closes the tab right
      // after submission detection.
      keepalive: true,
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

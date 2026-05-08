/**
 * One-shot demo: uploads a sample schema + metadata to the Walrus testnet
 * publisher and calls echo::form::create_form with the publish admin key.
 *
 * Run from repo root:
 *   pnpm --filter publish exec tsx src/scripts/createSampleForm.ts
 *
 * Prints the resulting Form object id + a /forms/[id] URL you can open.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromBase64 } from "@mysten/sui/utils";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const PACKAGE_ID =
  process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ??
  "0x76b0a4835148c647f0633df571d3a31969d346d50111ebe9351bfac05793bc37";
const PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
  "https://publisher.walrus-testnet.walrus.space";
const FULLNODE =
  process.env.SUI_FULLNODE_URL ?? "https://fullnode.testnet.sui.io:443";
const PROD_URL = "https://echo-20u.pages.dev";

// Pick a form to create via FORM env var (default = "demo").
const FORM_KEY = process.env.FORM ?? "demo";

interface FormSpec {
  schema: { version: 1; fields: Array<Record<string, unknown>> };
  metadata: { title: string; description: string };
  /** 0=Public, 1=AdminOnly, 2=Threshold, 3=TimeLocked, 4=Conditional. Default 0. */
  tier?: number;
  thresholdN?: number;
  thresholdM?: number;
  /** Absolute ms timestamp. Compute via Date.now() + offsetMs in main(). */
  unlockMs?: bigint;
  conditionalPolicyId?: string;
}

const FORMS: Record<string, FormSpec> = {
  demo: {
    schema: {
      version: 1,
      fields: [
        {
          id: "rating",
          type: "rating",
          label: "How was your Echo demo experience?",
          scale: 5,
          required: true,
        },
        {
          id: "category",
          type: "single_select",
          label: "What did you try?",
          required: true,
          options: [
            { value: "create", label: "Created a form" },
            { value: "submit", label: "Submitted a response" },
            { value: "admin", label: "Opened the admin viewer" },
            { value: "browse", label: "Just clicked around" },
          ],
        },
        {
          id: "feedback",
          type: "long_text",
          label: "Anything that worked well, or felt rough?",
        },
        {
          id: "wallet",
          type: "url",
          label: "Twitter / GitHub link (optional)",
        },
      ],
    },
    metadata: {
      title: "Echo demo · try it out",
      description:
        "Submit anything — gas is sponsored by Enoki, your answer lands on Walrus, the chain records the SubmissionRef. Feedback informs the v0.2 roadmap.",
    },
  },

  hackathon: {
    schema: {
      version: 1,
      fields: [
        {
          id: "project",
          type: "short_text",
          label: "What did you build?",
          required: true,
        },
        {
          id: "stack",
          type: "multi_select",
          label: "Mysten primitives you used",
          options: [
            { value: "sui", label: "Sui Move" },
            { value: "walrus", label: "Walrus" },
            { value: "seal", label: "Seal" },
            { value: "enoki", label: "Enoki / zkLogin" },
            { value: "memwal", label: "Memwal" },
            { value: "suins", label: "SuiNS" },
          ],
        },
        { id: "demo", type: "url", label: "Live demo URL", required: true },
        {
          id: "story",
          type: "long_text",
          label: "What problem does it solve and what's next?",
          required: true,
        },
        {
          id: "shoutout",
          type: "short_text",
          label: "Anyone you want to shout out? (optional)",
        },
      ],
    },
    metadata: {
      title: "What did you build at the hackathon?",
      description:
        "Share your project. Public form — answers go in the recap. Anonymous mode available if you'd rather skip the credit.",
    },
  },

  roadmap: {
    schema: {
      version: 1,
      fields: [
        {
          id: "nps",
          type: "rating",
          label:
            "0 = haven't tried Echo yet, 10 = already replacing Google Forms",
          scale: 10,
          required: true,
        },
        {
          id: "priority",
          type: "single_select",
          label: "Which v0.2 feature should ship first?",
          required: true,
          options: [
            { value: "a", label: "Browser-side indexer for encrypted tiers" },
            {
              value: "b",
              label: "Seal threshold reveal UI (N-of-M admin sigs)",
            },
            { value: "c", label: "Form templates marketplace (Walrus blobs)" },
            { value: "d", label: "Mainnet deploy" },
            { value: "e", label: "More privacy primitives — TLSN, nullifier" },
          ],
        },
        {
          id: "rough",
          type: "long_text",
          label: "Where did Echo feel rough today?",
        },
        {
          id: "wishlist",
          type: "long_text",
          label: "What's missing? (one idea per line)",
        },
      ],
    },
    metadata: {
      title: "Echo v0.2 — what should ship first?",
      description:
        "Public form. We'll RAG over the answers via /insights and prioritize the next sprint. ~60 seconds.",
    },
  },

  bug: {
    schema: {
      version: 1,
      fields: [
        {
          id: "where",
          type: "short_text",
          label: "Which page or flow broke?",
          required: true,
          placeholder: "e.g. /forms/new save flow",
        },
        {
          id: "expected",
          type: "long_text",
          label: "What did you expect to happen?",
          required: true,
        },
        {
          id: "actual",
          type: "long_text",
          label: "What actually happened?",
          required: true,
        },
        {
          id: "severity",
          type: "single_select",
          label: "Severity",
          required: true,
          options: [
            { value: "low", label: "Low — annoyance" },
            { value: "med", label: "Medium — workaround exists" },
            { value: "high", label: "High — blocks my work" },
            { value: "crit", label: "Critical — data loss / security" },
          ],
        },
        {
          id: "screenshot",
          type: "url",
          label: "Screenshot or recording link",
        },
      ],
    },
    metadata: {
      title: "Echo bug report",
      description:
        "Found something broken? Steps + expected vs actual + screenshot link helps us reproduce in minutes.",
    },
  },

  feedback: {
    schema: {
      version: 1,
      fields: [
        {
          id: "rating",
          type: "rating",
          label: "Overall, how do you feel about Echo?",
          scale: 5,
          required: true,
        },
        {
          id: "what_used",
          type: "multi_select",
          label: "Which features did you actually use?",
          options: [
            { value: "create", label: "Created a form" },
            { value: "submit", label: "Submitted a response" },
            { value: "decrypt", label: "Decrypted submissions (admin)" },
            { value: "anonymous", label: "Submitted anonymously" },
            { value: "image", label: "Uploaded a screenshot/image" },
            { value: "insights", label: "Asked an Insights/RAG question" },
            { value: "demo", label: "Used Demo admin mode" },
            { value: "browse", label: "Just clicked around" },
          ],
        },
        {
          id: "what_worked",
          type: "rich_text",
          label: "What worked? (Markdown supported · drop screenshots)",
          required: true,
        },
        {
          id: "what_rough",
          type: "rich_text",
          label: "What felt rough or confusing?",
        },
        {
          id: "would_use",
          type: "single_select",
          label: "Would you use Echo for a real form today?",
          required: true,
          options: [
            { value: "yes", label: "Yes" },
            { value: "maybe", label: "Maybe" },
            { value: "no", label: "Not yet" },
          ],
        },
        {
          id: "contact",
          type: "url",
          label: "Twitter / GitHub link (optional, so we can follow up)",
        },
      ],
    },
    metadata: {
      title: "Help shape Echo · v0.2 feedback",
      description:
        "If you tried Echo for the Walrus Sessions hackathon, we'd love your feedback. Public form — answers go on Walrus and feed our /insights board. Anonymous toggle available if you'd rather skip the credit.",
    },
  },

  // ---- Encrypted-tier demo variants. Submissions are Seal-encrypted before
  // upload to Walrus. Decryption requires the FormOwnerCap (or, in demo mode,
  // the Echo dapp's /api/demo/admin/decrypt endpoint signs with the demo key).

  admin: {
    schema: {
      version: 1,
      fields: [
        {
          id: "salary",
          type: "short_text",
          label: "Current annual compensation (USD)",
          required: true,
          placeholder: "e.g. 145000",
        },
        {
          id: "concerns",
          type: "long_text",
          label: "What's keeping you up at night about work?",
          required: true,
        },
        {
          id: "stay",
          type: "single_select",
          label: "If a competitor offered +20% today, would you leave?",
          required: true,
          options: [
            { value: "yes", label: "Yes — instantly" },
            { value: "maybe", label: "Maybe — depends on the company" },
            { value: "no", label: "No — I like it here" },
          ],
        },
      ],
    },
    metadata: {
      title: "Compensation pulse (AdminOnly demo)",
      description:
        "Encrypted to the FormOwnerCap holder via Seal. Only the form owner can decrypt — try /forms/<id>/admin in demo mode.",
    },
    tier: 1,
  },

  threshold: {
    schema: {
      version: 1,
      fields: [
        {
          id: "incident",
          type: "long_text",
          label: "Describe the incident in your own words",
          required: true,
        },
        {
          id: "involved",
          type: "short_text",
          label: "Who else was involved? (names or roles)",
          required: true,
        },
        {
          id: "evidence",
          type: "url",
          label: "Optional: link to evidence",
        },
      ],
    },
    metadata: {
      title: "Whistleblower channel (Threshold 1-of-1 demo)",
      description:
        "Threshold-encrypted with n=1, m=1. The cap holder (or any quorum > threshold) can decrypt. Demo simplification: 1-of-1 acts like AdminOnly under Seal but exercises the threshold path.",
    },
    tier: 2,
    thresholdN: 1,
    thresholdM: 1,
  },

  timelocked: {
    schema: {
      version: 1,
      fields: [
        {
          id: "prediction",
          type: "long_text",
          label: "Your prediction for the team's Q3 launch",
          required: true,
        },
        {
          id: "confidence",
          type: "rating",
          label: "How confident are you? (1 = guess, 10 = certain)",
          scale: 10,
          required: true,
        },
      ],
    },
    metadata: {
      title: "Sealed prediction (TimeLocked demo)",
      description:
        "Encrypted until the unlock deadline (5 minutes from creation, for demo). Anyone can decrypt after the deadline — Seal key servers refuse before. Watch /forms/<id>/admin auto-flip from 'encrypted' to 'decryptable'.",
    },
    tier: 3,
    // unlockMs is set in main() — Date.now() + 5min
  },
};

const SELECTED = FORMS[FORM_KEY];
if (!SELECTED) {
  console.error(
    `Unknown FORM=${FORM_KEY}. Available: ${Object.keys(FORMS).join(", ")}`,
  );
  process.exit(1);
}
const SCHEMA = SELECTED.schema;
const METADATA = SELECTED.metadata;

async function uploadJson(data: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const resp = await fetch(`${PUBLISHER}/v1/blobs?epochs=5`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: bytes as unknown as ArrayBuffer,
  });
  if (!resp.ok) {
    throw new Error(
      `Publisher HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
    );
  }
  const json = (await resp.json()) as {
    newlyCreated?: { blobObject?: { blobId?: string } };
    alreadyCertified?: { blobId?: string };
  };
  const blobId =
    json.newlyCreated?.blobObject?.blobId ?? json.alreadyCertified?.blobId;
  if (!blobId) throw new Error("Publisher returned no blob id");
  return blobId;
}

async function main() {
  const secretKey = process.env.ADMIN_SECRET_KEY;
  if (!secretKey) {
    console.error("ADMIN_SECRET_KEY not set in publish/.env");
    process.exit(1);
  }
  const keypair = Ed25519Keypair.fromSecretKey(fromBase64(secretKey).slice(1));
  const sender = keypair.getPublicKey().toSuiAddress();
  console.log(`admin: ${sender}`);

  console.log("uploading schema to Walrus publisher…");
  const schemaBlobId = await uploadJson(SCHEMA);
  console.log(`  schema blob: ${schemaBlobId}`);

  console.log("uploading metadata to Walrus publisher…");
  const metadataBlobId = await uploadJson(METADATA);
  console.log(`  metadata blob: ${metadataBlobId}`);

  const client = new SuiGrpcClient({ network: "testnet", baseUrl: FULLNODE });

  const tier = SELECTED.tier ?? 0;
  const thresholdN = SELECTED.thresholdN ?? 0;
  const thresholdM = SELECTED.thresholdM ?? 0;
  // For TimeLocked, default unlock to "now + 5 min" so testers see auto-unlock
  // within one demo session. Override per-spec via SELECTED.unlockMs if needed.
  const unlockMs =
    SELECTED.unlockMs ?? (tier === 3 ? BigInt(Date.now() + 5 * 60 * 1000) : 0n);
  const conditionalPolicyId = SELECTED.conditionalPolicyId ?? "";

  console.log(
    `tier=${tier} n=${thresholdN} m=${thresholdM} unlockMs=${unlockMs}`,
  );

  const tx = new Transaction();
  const cap = tx.moveCall({
    target: `${PACKAGE_ID}::form::create_form`,
    arguments: [
      tx.pure.string(schemaBlobId),
      tx.pure.string(metadataBlobId),
      tx.pure.u8(tier),
      tx.pure.u8(thresholdN),
      tx.pure.u8(thresholdM),
      tx.pure.u64(unlockMs),
      tx.pure.string(conditionalPolicyId),
      tx.pure.vector("address", []),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  tx.transferObjects([cap], tx.pure.address(sender));
  tx.setSender(sender);

  const built = await tx.build({ client });
  const { signature } = await keypair.signTransaction(built);
  const resp = await client.executeTransaction({
    transaction: built,
    signatures: [signature],
    include: { effects: true },
  });
  if (resp.FailedTransaction) {
    console.error(
      "create_form failed:",
      JSON.stringify(resp.FailedTransaction.effects.status, null, 2),
    );
    process.exit(1);
  }
  if (!resp.Transaction)
    throw new Error("expected successful tx but got nothing");
  const created = resp.Transaction.effects.changedObjects.filter(
    (c) => c.idOperation === "Created",
  );
  const formObj = created.find((c) => c.outputOwner?.$kind === "Shared");
  if (!formObj) {
    console.error("no shared Form object id in effects");
    process.exit(1);
  }

  console.log("");
  console.log(`✓ form id: ${formObj.objectId}`);
  console.log(`  digest:   ${resp.Transaction.digest}`);
  console.log("");
  console.log("open in browser:");
  console.log(`  prod   → ${PROD_URL}/forms/${formObj.objectId}`);
  console.log(`  local  → http://localhost:3333/forms/${formObj.objectId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

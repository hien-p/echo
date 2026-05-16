/**
 * Seed N=3 fake submissions to a form. Reads the form's privacy_tier from
 * chain, builds plausible answers from the schema, encrypts via Seal if the
 * tier requires it, uploads the (cipher)payload to the Walrus testnet
 * publisher, and calls submission::submit with the resulting blob id.
 *
 * Run from repo root:
 *   FORM_ID=0x... pnpm --filter publish exec env-cmd -f .env tsx src/scripts/seedSubmissions.ts
 *
 * Optional: COUNT=5 to seed 5 instead of the default 3.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromBase64 } from "@mysten/sui/utils";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SealClient } from "@mysten/seal";

// Default package id matches createSampleForm.ts so the two scripts stay in
// sync even when publish/.env doesn't set ECHO_PACKAGE_ID explicitly.
const PACKAGE_ID =
  process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ??
  process.env.ECHO_PACKAGE_ID ??
  "0xf7e9261724da6c6ae4869bbf623ead796ea31f6a90ea8dcdb30d35568870763c";
const PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
  "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ??
  "https://aggregator.walrus-testnet.walrus.space";
const FULLNODE =
  process.env.SUI_FULLNODE_URL ?? "https://fullnode.testnet.sui.io:443";
const FORM_ID = process.env.FORM_ID ?? "";
const COUNT = Number(process.env.COUNT ?? "3");

// Mysten Labs allowlisted testnet key servers (Open mode).
const TESTNET_KEY_SERVERS = [
  {
    objectId:
      "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
    weight: 1,
  },
  {
    objectId:
      "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
    weight: 1,
  },
];

const PRIVACY_PUBLIC = 0;
const PRIVACY_TIME_LOCKED = 3;
const PRIVACY_CONDITIONAL = 4;

interface OnChainForm {
  schema_blob_id: string;
  privacy_tier: number;
  threshold_n?: number;
  threshold_m?: number;
  unlock_ms?: string;
  conditional_policy_id?: string;
}

interface SchemaField {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  scale?: number;
}

interface FormSchema {
  version: number;
  fields: SchemaField[];
}

async function uploadBytes(bytes: Uint8Array): Promise<string> {
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

async function fetchJson<T>(blobId: string): Promise<T> {
  const resp = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!resp.ok) {
    throw new Error(
      `Aggregator HTTP ${resp.status} for ${blobId}: ${await resp.text()}`,
    );
  }
  return (await resp.json()) as T;
}

// Per-field-keyword sample pools. Picked by index so each seeded submission
// gives the form distinct, plausible answers rather than generic templates.
const SAMPLES = {
  salary: ["145000", "182000", "215000", "98000", "240000"],
  concerns: [
    "Burnout — every Friday I'm running on empty and I don't see the team scaling fast enough.",
    "Career growth has plateaued. I haven't shipped anything that I'm genuinely proud of in two quarters.",
    "Work-life balance got worse after the reorg. Async expectations turned into 9pm Slack threads.",
    "Compensation is below market for senior IC. The last refresh barely matched cost-of-living.",
    "Team cohesion — three engineers left in six weeks and morale never recovered.",
  ],
  predictions: [
    "We'll hit the launch deadline but the v1 will need a follow-up patch within two weeks.",
    "Q3 slips to Q4. The auth integration alone will eat 3 sprints we haven't planned for.",
    "Strong launch, but adoption stalls until we ship the mobile companion app.",
    "Quiet launch with positive feedback from existing users; new acquisition stays flat.",
    "Pushed back to early Q4 — the partner API contract isn't going to land in time.",
  ],
  incidents: [
    "Customer data was visible to the wrong tenant for ~40 minutes during the schema migration on Tuesday.",
    "I overheard a vendor discussing internal pricing terms in a coffee shop. Possibly an NDA breach.",
    "A teammate mass-deleted production logs to cover up a failed deploy. I have screenshots.",
    "The on-call rotation is being skipped by a senior who delegates pages without notifying ops.",
    "Recruiting promised candidates RSU values that don't match what HR finalizes. Trust is eroding.",
  ],
  bugs: [
    "Save flow on /forms/new doesn't surface validation errors until after the wallet popup.",
    "Mobile Safari freezes when scrolling a long submissions list — happens after ~50 rows.",
    "Decrypt button shows 'Loading…' forever if the Walrus aggregator is down. No error state.",
    "Header pill animates twice on cold load — looks like a hydration mismatch flash.",
  ],
  generic_short: [
    "Echo demo at the meetup last week",
    "Ship the new admin tooling",
    "Prototype shipped on Tuesday",
    "Migrate to mainnet after the audit",
    "Internal feedback cycle for v0.2",
  ],
  generic_long: [
    "Things have been intense — we shipped fast but cut corners on tests, and now the on-call rotation is paying for it. Need a sprint to pay down.",
    "Mostly positive. The team gelled after the offsite, and the new auth flow is finally landing reliably. Concerned about how long the migration will take.",
    "Open question on whether to keep iterating on the current architecture or rewrite the data layer. Both options have ~6 weeks of risk attached.",
    "User feedback this week was sharper than usual. Three asked for the same feature; we should put it on the roadmap.",
  ],
  url: [
    "https://github.com/example/repo",
    "https://twitter.com/example",
    "https://example.com/demo",
    "https://drive.example.com/share/abc",
  ],
};

function pickSample(pool: string[], index: number): string {
  return pool[index % pool.length];
}

function pickByLabel(
  label: string,
  fieldType: string,
  index: number,
): string | null {
  const lower = label.toLowerCase();
  if (/(salary|compensation|comp\b|pay)/i.test(lower))
    return pickSample(SAMPLES.salary, index);
  if (/(concern|worry|keeping you up|rough|wrong|pain)/i.test(lower))
    return pickSample(SAMPLES.concerns, index);
  if (/(predict|forecast|launch|q[1-4]\b|deadline)/i.test(lower))
    return pickSample(SAMPLES.predictions, index);
  if (/(incident|whistle|witnessed|abuse|breach|complaint)/i.test(lower))
    return pickSample(SAMPLES.incidents, index);
  if (/(broke|bug|expected|actual|where)/i.test(lower))
    return pickSample(SAMPLES.bugs, index);
  if (fieldType === "url") return pickSample(SAMPLES.url, index);
  if (fieldType === "long_text" || fieldType === "rich_text")
    return pickSample(SAMPLES.generic_long, index);
  return pickSample(SAMPLES.generic_short, index);
}

function generateAnswers(
  schema: FormSchema,
  index: number,
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const f of schema.fields) {
    switch (f.type) {
      case "short_text":
      case "long_text":
      case "rich_text":
      case "url": {
        const value = pickByLabel(f.label, f.type, index) ?? "(empty)";
        answers[f.id] = { kind: "text", value };
        break;
      }
      case "single_select":
      case "dropdown": {
        const opt = f.options?.[index % (f.options?.length || 1)];
        answers[f.id] = { kind: "choice", value: opt?.value ?? "" };
        break;
      }
      case "multi_select": {
        const optList = f.options ?? [];
        // Pick 1-3 options, varying by index for diversity.
        const count = Math.min(optList.length, 1 + (index % 3));
        const start = index % Math.max(1, optList.length);
        const picked: string[] = [];
        for (let i = 0; i < count; i++) {
          picked.push(optList[(start + i) % optList.length].value);
        }
        answers[f.id] = { kind: "choice", value: picked };
        break;
      }
      case "rating": {
        const scale = f.scale ?? 5;
        // Realistic distribution: cluster mid-high (3-4 on /5, 6-9 on /10).
        const candidates = scale >= 10 ? [6, 7, 8, 9, 7] : [3, 4, 5, 4, 3];
        answers[f.id] = {
          kind: "rating",
          value: Math.min(scale, candidates[index % candidates.length]),
        };
        break;
      }
      case "checkbox":
        answers[f.id] = { kind: "checkbox", value: index % 2 === 0 };
        break;
      case "date":
      case "time":
        answers[f.id] = {
          kind: "date",
          value: new Date(Date.now() - index * 86400_000)
            .toISOString()
            .slice(0, 10),
        };
        break;
      default:
        answers[f.id] = { kind: "text", value: "(unsupported field type)" };
    }
  }
  return answers;
}

function buildTierIdentity(args: {
  formId: string;
  tier: number;
  unlockMs?: bigint;
  conditionalPolicyId?: string;
}): Uint8Array {
  const formIdBytes = hexToBytes(args.formId.replace(/^0x/, ""));
  const tierByte = new Uint8Array([args.tier]);
  let extra: Uint8Array;
  if (args.tier === PRIVACY_TIME_LOCKED) {
    extra = u64ToBytes(args.unlockMs ?? BigInt(0));
  } else if (args.tier === PRIVACY_CONDITIONAL) {
    extra = new TextEncoder().encode(args.conditionalPolicyId ?? "");
  } else {
    extra = new Uint8Array(0);
  }
  const out = new Uint8Array(
    formIdBytes.length + tierByte.length + extra.length,
  );
  out.set(formIdBytes, 0);
  out.set(tierByte, formIdBytes.length);
  out.set(extra, formIdBytes.length + tierByte.length);
  return out;
}

function loadOneKey(raw: string): Ed25519Keypair {
  // Sui CLI's bech32 export: suiprivkey1…
  if (raw.startsWith("suiprivkey1")) {
    const { secretKey } = decodeSuiPrivateKey(raw);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  // Bare 32-byte hex (e.g. our MEMWAL_PRIVATE_KEY).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Ed25519Keypair.fromSecretKey(hexToBytes(raw));
  }
  // Base64 — handles both 32-byte raw and 33-byte scheme-prefixed.
  const buf = fromBase64(raw);
  const stripped = buf.length === 33 ? buf.slice(1) : buf;
  return Ed25519Keypair.fromSecretKey(stripped);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error("invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
function u64ToBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  const mask = BigInt(0xff);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & mask);
    v = v >> BigInt(8);
  }
  return out;
}

async function main() {
  if (!PACKAGE_ID || !PACKAGE_ID.startsWith("0x")) {
    console.error(
      "ECHO_PACKAGE_ID (or NEXT_PUBLIC_ECHO_PACKAGE_ID) not set in publish/.env",
    );
    process.exit(1);
  }
  if (!FORM_ID || !FORM_ID.startsWith("0x")) {
    console.error("FORM_ID env var required (the form's Sui object id).");
    process.exit(1);
  }
  const adminSecret = process.env.ADMIN_SECRET_KEY;
  if (!adminSecret) {
    console.error("ADMIN_SECRET_KEY not set in publish/.env");
    process.exit(1);
  }
  const adminKp = Ed25519Keypair.fromSecretKey(
    fromBase64(adminSecret).slice(1),
  );
  const adminAddr = adminKp.getPublicKey().toSuiAddress();

  // Build the rotating signer pool. Sources, in priority:
  //   1. SIGNERS env (comma-separated; supports suiprivkey1…/64-hex/base64+scheme)
  //   2. N fresh ephemeral keypairs if EPHEMERALS=N
  //   3. ADMIN_SECRET_KEY as the final fallback so the script always
  //      has at least one signer
  // Each non-admin signer gets auto-topped-up from admin when its
  // balance is below the gas budget — keeps the demo deterministic
  // even after the user pastes a brand-new wallet bech32 string.
  const signers: Ed25519Keypair[] = [];
  const sigEnv = (process.env.SIGNERS ?? "").trim();
  if (sigEnv) {
    for (const raw of sigEnv.split(/[,\s]+/).filter(Boolean)) {
      try {
        signers.push(loadOneKey(raw));
      } catch (e) {
        console.error(
          `skipping malformed signer key "${raw.slice(0, 16)}…": ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }
  const ephemeralCount = Number(process.env.EPHEMERALS ?? "0");
  for (let i = 0; i < ephemeralCount; i++) {
    signers.push(new Ed25519Keypair());
  }
  if (signers.length === 0) signers.push(adminKp);

  console.log(`form:        ${FORM_ID}`);
  console.log(`count:       ${COUNT}`);
  console.log(`signers:     ${signers.length} (rotating)`);
  for (let i = 0; i < signers.length; i++) {
    console.log(`  [${i}] ${signers[i].getPublicKey().toSuiAddress()}`);
  }

  const client = new SuiGrpcClient({ network: "testnet", baseUrl: FULLNODE });

  // Top up any signer with < 200M mist so submission gas selection succeeds.
  // Skips the admin (assumed funded). Sleeps 4s after topup so the new coin
  // is indexed before the first submit reads it.
  const TOPUP_MIST = 300_000_000n;
  const MIN_MIST = 200_000_000n;
  const needsTopup: Ed25519Keypair[] = [];
  for (const kp of signers) {
    const addr = kp.getPublicKey().toSuiAddress();
    if (addr === adminAddr) continue;
    const bal = (await client.getBalance({
      owner: addr,
      coinType: "0x2::sui::SUI",
    })) as unknown as { totalBalance?: string };
    if (BigInt(bal.totalBalance ?? "0") < MIN_MIST) {
      needsTopup.push(kp);
    }
  }
  if (needsTopup.length > 0) {
    console.log(`topping up ${needsTopup.length} signer(s) from admin…`);
    const topupTx = new Transaction();
    for (const kp of needsTopup) {
      const [coin] = topupTx.splitCoins(topupTx.gas, [
        topupTx.pure.u64(TOPUP_MIST),
      ]);
      topupTx.transferObjects(
        [coin],
        topupTx.pure.address(kp.getPublicKey().toSuiAddress()),
      );
    }
    topupTx.setSender(adminAddr);
    const built = await topupTx.build({ client });
    const { signature } = await adminKp.signTransaction(built);
    const r = await client.executeTransaction({
      transaction: built,
      signatures: [signature],
      include: { effects: true },
    });
    if (r.FailedTransaction) {
      console.error(
        "topup failed:",
        JSON.stringify(r.FailedTransaction.effects.status, null, 2),
      );
      process.exit(1);
    }
    console.log(`✓ topped up · digest ${r.Transaction!.digest}`);
    await new Promise((res) => setTimeout(res, 4000));
  }

  // 1. Read form on-chain.
  const formObj = await client.getObject({
    objectId: FORM_ID,
    include: { json: true },
  });
  const onChain = formObj.object.json as OnChainForm | null;
  if (!onChain) throw new Error("Form not found.");
  const tier = onChain.privacy_tier;
  const unlockMs = onChain.unlock_ms ? BigInt(onChain.unlock_ms) : 0n;
  const thresholdM = Number(onChain.threshold_m ?? 0);
  console.log(`tier=${tier} unlockMs=${unlockMs} threshold_m=${thresholdM}`);

  // 2. Fetch schema from Walrus.
  const schema = await fetchJson<FormSchema>(onChain.schema_blob_id);
  console.log(`schema fields: ${schema.fields.map((f) => f.id).join(", ")}`);

  // 3. Build a Seal client only if needed.
  let seal: SealClient | null = null;
  if (tier !== PRIVACY_PUBLIC) {
    seal = new SealClient({
      suiClient: client as unknown as ConstructorParameters<
        typeof SealClient
      >[0]["suiClient"],
      serverConfigs: TESTNET_KEY_SERVERS,
      verifyKeyServers: false,
    });
  }

  // Seal threshold = number of key servers needed to release shares.
  // Bounded by the testnet committee (Mysten Open mode = 2 servers).
  // Forms with threshold_m > 2 (e.g. 2-of-3 multisig) would otherwise
  // pass an unsupported threshold and seal.encrypt() throws.
  const sealThreshold = Math.min(
    thresholdM > 0 ? thresholdM : 1,
    TESTNET_KEY_SERVERS.length,
  );
  const identity =
    tier !== PRIVACY_PUBLIC
      ? buildTierIdentity({
          formId: FORM_ID,
          tier,
          unlockMs,
          conditionalPolicyId: onChain.conditional_policy_id ?? "",
        })
      : null;

  // 4. Loop COUNT times, encrypt+upload+submit each.
  for (let i = 0; i < COUNT; i++) {
    console.log(`\n[${i + 1}/${COUNT}] generating...`);
    const payload = {
      schemaVersion: schema.version,
      answers: generateAnswers(schema, i),
      submittedAt: new Date().toISOString(),
    };
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));

    let bytes: Uint8Array;
    if (seal && identity) {
      const result = await seal.encrypt({
        threshold: sealThreshold,
        packageId: PACKAGE_ID,
        id: bytesToHex(identity),
        data: plaintext,
      });
      bytes = result.encryptedObject;
      console.log(
        `  encrypted: ${plaintext.length}B → ${bytes.length}B (Seal)`,
      );
    } else {
      bytes = plaintext;
      console.log(`  plaintext: ${bytes.length}B`);
    }

    const blobId = await uploadBytes(bytes);
    console.log(`  walrus blob: ${blobId}`);

    // Round-robin through the signer pool so the dashboard shows
    // distinct submitter addresses on the demo form.
    const signer = signers[i % signers.length];
    const sender = signer.getPublicKey().toSuiAddress();
    console.log(`  signer: ${sender.slice(0, 10)}…${sender.slice(-4)}`);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::submission::submit`,
      arguments: [
        tx.object(FORM_ID),
        tx.pure.string(blobId),
        tx.pure.u8(tier),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    tx.setSender(sender);

    const built = await tx.build({ client });
    const { signature } = await signer.signTransaction(built);
    const resp = await client.executeTransaction({
      transaction: built,
      signatures: [signature],
      include: { effects: true },
    });
    if (resp.FailedTransaction) {
      console.error(
        `  submit failed:`,
        JSON.stringify(resp.FailedTransaction.effects.status, null, 2),
      );
      process.exit(1);
    }
    console.log(`  digest: ${resp.Transaction!.digest}`);
  }

  console.log(`\n✓ seeded ${COUNT} submissions to ${FORM_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

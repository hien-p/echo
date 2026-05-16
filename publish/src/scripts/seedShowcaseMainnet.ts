/**
 * Seed a full MAINNET showcase: forms across all 5 privacy tiers, multiple
 * submissions each (with real ffmpeg-generated image + video media stored on
 * Walrus), plus a funded bounty pool and reputation — so every dashboard KPI
 * and the magazine submission viewer light up with genuine on-chain data.
 *
 * All objects are owned by the mainnet demo-admin address, so the dashboard
 * shows them in Demo-admin mode and for that connected wallet.
 *
 * Run from repo root (key NEVER written to disk):
 *   SEED_ADMIN_KEY="$(sui keytool export --key-identity <demo-admin> --json \
 *     | python3 -c 'import sys,json;print(json.load(sys.stdin)["exportedPrivateKey"])')" \
 *   NEXT_PUBLIC_ECHO_PACKAGE_ID=0x9677... \
 *   pnpm --filter publish exec tsx src/scripts/seedShowcaseMainnet.ts
 *
 * Env:
 *   SEED_ADMIN_KEY  (required) suiprivkey1… / hex / base64 for the demo admin
 *   NEXT_PUBLIC_ECHO_PACKAGE_ID  mainnet Echo package (default 0x9677…)
 *   API_BASE        Walrus upload + blob proxy (default staging.echo-20u)
 *   SUI_FULLNODE_URL  default https://fullnode.mainnet.sui.io:443
 *   SUBS_PER_FORM   submissions per form (default 4)
 *   BOUNTY_SUI      SUI to fund the showcase bounty (default 0.05)
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromBase64 } from "@mysten/sui/utils";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

const PACKAGE_ID =
  process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ??
  process.env.ECHO_PACKAGE_ID ??
  "0x9677ab37c9e1097d11034848aee570c50f5c981a2d12756faccbd07d90d502c2";
const API_BASE = (
  process.env.API_BASE ?? "https://staging.echo-20u.pages.dev"
).replace(/\/$/, "");
const FULLNODE =
  process.env.SUI_FULLNODE_URL ?? "https://fullnode.mainnet.sui.io:443";
const SUBS_PER_FORM = Number(process.env.SUBS_PER_FORM ?? "4");
const BOUNTY_MIST = BigInt(
  Math.round(Number(process.env.BOUNTY_SUI ?? "0.05") * 1e9),
);

interface Field {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  scale?: number;
  accept?: string;
}
interface FormSpec {
  key: string;
  title: string;
  description: string;
  tier: number;
  thresholdN?: number;
  thresholdM?: number;
  unlockOffsetMs?: number;
  fields: Field[];
}

const sel = (v: string) => ({
  value: v,
  label: v[0].toUpperCase() + v.slice(1),
});

const FORMS: FormSpec[] = [
  {
    key: "feedback",
    title: "Help shape Echo · v0.2 feedback",
    description:
      "Public form — answers land on Walrus and feed the /insights board. Drop screenshots and clips in the rich-text fields.",
    tier: 0,
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
          "create",
          "submit",
          "decrypt",
          "anonymous",
          "image",
          "insights",
        ].map(sel),
      },
      {
        id: "what_worked",
        type: "rich_text",
        label: "What worked? (Markdown · drop screenshots)",
        required: true,
      },
      {
        id: "what_rough",
        type: "rich_text",
        label: "What felt rough or confusing?",
      },
      {
        id: "shot",
        type: "screenshot",
        label: "Attach a screenshot",
        accept: "image/*",
      },
      {
        id: "clip",
        type: "video",
        label: "Optional: screen recording",
        accept: "video/*",
      },
      {
        id: "would_use",
        type: "single_select",
        label: "Would you use Echo for a real form today?",
        required: true,
        options: ["yes", "maybe", "no"].map(sel),
      },
      { id: "contact", type: "url", label: "Twitter / GitHub (optional)" },
    ],
  },
  {
    key: "showcase",
    title: "Echo product showcase · field gallery",
    description:
      "Public demo exercising every field type — uploads, video, signature, dates — with real Walrus-stored media in each response.",
    tier: 0,
    fields: [
      {
        id: "name",
        type: "short_text",
        label: "Your name or handle",
        required: true,
      },
      {
        id: "story",
        type: "long_text",
        label: "How would you use Echo?",
        required: true,
      },
      {
        id: "highlight",
        type: "rich_text",
        label: "Highlight reel (embed an image + clip)",
        required: true,
      },
      {
        id: "file",
        type: "file_upload",
        label: "Attach a design/asset",
        accept: "image/*",
      },
      {
        id: "demo_clip",
        type: "video",
        label: "Walkthrough video",
        accept: "video/*",
      },
      { id: "sig", type: "signature", label: "Sign off" },
      { id: "when", type: "date", label: "When did you try it?" },
      {
        id: "primitive",
        type: "dropdown",
        label: "Favorite Mysten primitive",
        options: ["walrus", "seal", "enoki", "sui-move"].map(sel),
      },
    ],
  },
  {
    key: "comp",
    title: "Compensation pulse (AdminOnly)",
    description:
      "AdminOnly tier — only the FormOwnerCap holder can decrypt. Showcases the encrypted pipeline + admin decrypt surface.",
    tier: 1,
    fields: [
      {
        id: "salary",
        type: "short_text",
        label: "Annual compensation (USD)",
        required: true,
      },
      {
        id: "concerns",
        type: "long_text",
        label: "What's keeping you up about work?",
        required: true,
      },
      {
        id: "evidence",
        type: "screenshot",
        label: "Optional supporting screenshot",
        accept: "image/*",
      },
      {
        id: "stay",
        type: "single_select",
        label: "Competitor offers +20% — would you leave?",
        required: true,
        options: ["yes", "maybe", "no"].map(sel),
      },
    ],
  },
  {
    key: "whistle",
    title: "Whistleblower channel (Threshold)",
    description:
      "Threshold-encrypted (1-of-1 demo). Exercises the Seal threshold path + the m-of-n decrypt UI.",
    tier: 2,
    thresholdN: 1,
    thresholdM: 1,
    fields: [
      {
        id: "incident",
        type: "long_text",
        label: "Describe the incident",
        required: true,
      },
      {
        id: "involved",
        type: "short_text",
        label: "Who else was involved?",
        required: true,
      },
      {
        id: "proof",
        type: "screenshot",
        label: "Evidence screenshot",
        accept: "image/*",
      },
    ],
  },
  {
    key: "sealed",
    title: "Sealed prediction (TimeLocked)",
    description:
      "Encrypted until the unlock deadline (~10 min from creation, for demo). Watch /forms/<id>/admin flip from encrypted to decryptable.",
    tier: 3,
    unlockOffsetMs: 10 * 60 * 1000,
    fields: [
      {
        id: "prediction",
        type: "long_text",
        label: "Your prediction for Q3 launch",
        required: true,
      },
      {
        id: "confidence",
        type: "rating",
        label: "How confident? (1 guess … 10 certain)",
        scale: 10,
        required: true,
      },
      {
        id: "exhibit",
        type: "video",
        label: "Optional video rationale",
        accept: "video/*",
      },
    ],
  },
];

// ── Walrus ────────────────────────────────────────────────────────────────
async function uploadBytes(bytes: Uint8Array, epochs = 53): Promise<string> {
  const resp = await fetch(`${API_BASE}/api/walrus/upload?epochs=${epochs}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: new Blob([bytes as unknown as ArrayBuffer]),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    blobId?: string;
    error?: string;
  };
  if (!resp.ok || !data.blobId) {
    throw new Error(data.error ?? `walrus upload HTTP ${resp.status}`);
  }
  return data.blobId;
}
const uploadJson = (o: unknown) =>
  uploadBytes(new TextEncoder().encode(JSON.stringify(o)));
const blobUrl = (id: string) => `${API_BASE}/api/walrus/blob/${id}`;

// ── ffmpeg media ────────────────────────────────────────────────────────────
function genMedia(dir: string) {
  const colors = ["#4DA2FF", "#0A0A0A", "#10b981", "#B45309", "#7c3aed"];
  const ff = (args: string[]) =>
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
      cwd: dir,
    });
  // This ffmpeg build may lack drawtext (no libfreetype). Use only core
  // libavfilter sources: solid `color` frames + a `testsrc2` pattern for
  // visual variety. All produce valid PNG/MP4.
  const images: string[] = [];
  for (let i = 0; i < 5; i++) {
    const f = `img${i}.png`;
    const src =
      i % 2 === 0
        ? `color=c=${colors[i]}:s=1200x630`
        : `testsrc2=s=1200x630:d=1`;
    ff(["-f", "lavfi", "-i", src, "-frames:v", "1", f]);
    images.push(join(dir, f));
  }
  const vid = join(dir, "clip.mp4");
  ff([
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=24:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    "clip.mp4",
  ]);
  return { images, vid };
}

// ── tx helpers ──────────────────────────────────────────────────────────────
function loadKeypair(raw: string): Ed25519Keypair {
  if (raw.startsWith("suiprivkey1")) {
    return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(raw).secretKey);
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++)
      out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    return Ed25519Keypair.fromSecretKey(out);
  }
  const buf = fromBase64(raw);
  return Ed25519Keypair.fromSecretKey(buf.length === 33 ? buf.slice(1) : buf);
}

type GrpcClient = InstanceType<typeof SuiGrpcClient>;

async function exec(
  client: GrpcClient,
  kp: Ed25519Keypair,
  tx: Transaction,
  label: string,
) {
  tx.setSender(kp.toSuiAddress());
  const built = await tx.build({ client });
  const { signature } = await kp.signTransaction(built);
  const resp = await client.executeTransaction({
    transaction: built,
    signatures: [signature],
    include: { effects: true },
  });
  if (resp.FailedTransaction) {
    throw new Error(
      `${label} failed: ${JSON.stringify(resp.FailedTransaction.effects.status)}`,
    );
  }
  if (!resp.Transaction) throw new Error(`${label}: no Transaction in resp`);
  // All txs share the admin's single gas coin. executeTransaction returns
  // before the new gas-object version is globally available, so the next
  // tx would reference a stale/locked coin ("already locked by a different
  // transaction"). Wait for finality before returning.
  const digest = resp.Transaction.digest;
  const c = client as unknown as {
    waitForTransaction?: (a: { digest: string }) => Promise<unknown>;
  };
  try {
    if (typeof c.waitForTransaction === "function") {
      await c.waitForTransaction({ digest });
    }
  } catch {
    /* fall through to the settle delay */
  }
  await new Promise((r) => setTimeout(r, 2500));
  return resp.Transaction;
}

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const sample = <T>(a: T[], n: number): T[] =>
  [...a].sort(() => Math.random() - 0.5).slice(0, n);

const LOREM = [
  "Spun up a feedback form in under a minute — the gas-sponsored submit is the killer feature.",
  "Walrus storage + on-chain ref is exactly the trust model we wanted. Decrypt UX was smooth.",
  "Tried the encrypted tiers; the threshold flow is clearer than I expected. Shipping this.",
  "Used it for a hackathon recap. The /insights RAG over answers is genuinely useful.",
  "Privacy tiers are the standout. Time-locked predictions are a great demo.",
];

function buildAnswers(
  fields: Field[],
  media: { images: string[]; imgBlobs: string[]; vidBlob: string },
): Record<string, unknown> {
  const ans: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.type) {
      case "rating":
        ans[f.id] = {
          kind: "rating",
          value: 1 + Math.floor(Math.random() * (f.scale ?? 5)),
        };
        break;
      case "single_select":
      case "dropdown":
        ans[f.id] = { kind: "choice", value: pick(f.options ?? []).value };
        break;
      case "multi_select":
        ans[f.id] = {
          kind: "choice",
          value: sample(
            (f.options ?? []).map((o) => o.value),
            2 + Math.floor(Math.random() * 2),
          ),
        };
        break;
      case "checkbox":
        ans[f.id] = { kind: "checkbox", value: Math.random() > 0.5 };
        break;
      case "date":
      case "time":
        ans[f.id] = {
          kind: "date",
          value: new Date().toISOString().slice(0, 10),
        };
        break;
      case "url":
        ans[f.id] = { kind: "text", value: "https://github.com/hien-p/echo" };
        break;
      case "signature":
        ans[f.id] = {
          kind: "text",
          value: `— signed, demo tester #${Math.floor(Math.random() * 99)}`,
        };
        break;
      case "rich_text": {
        const img = pick(media.imgBlobs);
        ans[f.id] = {
          kind: "text",
          value:
            `${pick(LOREM)}\n\n` +
            `![screenshot](${blobUrl(img)})\n\n` +
            `Clip: [▶ watch the 3s demo](${blobUrl(media.vidBlob)})\n\n` +
            `<video src="${blobUrl(media.vidBlob)}" controls width="480"></video>`,
        };
        break;
      }
      case "screenshot":
      case "file_upload":
        ans[f.id] = {
          kind: "blob",
          blobId: pick(media.imgBlobs),
          mimeType: "image/png",
          bytes: 60000,
        };
        break;
      case "video":
        ans[f.id] = {
          kind: "blob",
          blobId: media.vidBlob,
          mimeType: "video/mp4",
          bytes: 120000,
        };
        break;
      case "long_text":
        ans[f.id] = { kind: "text", value: `${pick(LOREM)} ${pick(LOREM)}` };
        break;
      default:
        ans[f.id] = { kind: "text", value: pick(LOREM) };
    }
  }
  return ans;
}

async function main() {
  const keyRaw = process.env.SEED_ADMIN_KEY ?? "";
  if (!keyRaw) throw new Error("SEED_ADMIN_KEY not set");
  if (!PACKAGE_ID.startsWith("0x")) throw new Error("bad ECHO_PACKAGE_ID");
  const kp = loadKeypair(keyRaw);
  const addr = kp.toSuiAddress();
  const client = new SuiGrpcClient({ network: "mainnet", baseUrl: FULLNODE });
  console.log(`◆ admin   ${addr}`);
  console.log(`◆ package ${PACKAGE_ID}`);
  console.log(`◆ walrus  ${API_BASE}\n`);

  // 1) Media → Walrus
  const dir = mkdtempSync(join(tmpdir(), "echo-media-"));
  let imgBlobs: string[] = [];
  let vidBlob = "";
  try {
    console.log("→ generating media (ffmpeg)…");
    const { images, vid } = genMedia(dir);
    console.log("→ uploading media to Walrus…");
    imgBlobs = [];
    for (const p of images) {
      imgBlobs.push(await uploadBytes(readFileSync(p)));
    }
    vidBlob = await uploadBytes(readFileSync(vid));
    console.log(`  ✓ ${imgBlobs.length} images + 1 video on Walrus\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const created: {
    key: string;
    title: string;
    formId: string;
    tier: number;
  }[] = [];

  // 2) Forms
  for (const spec of FORMS) {
    const coverBlob = pick(imgBlobs);
    const schemaBlob = await uploadJson({ version: 1, fields: spec.fields });
    const metaBlob = await uploadJson({
      title: spec.title,
      description: spec.description,
      accentColor: "#4DA2FF",
      coverBlobId: coverBlob,
    });
    const unlockMs =
      spec.tier === 3 && spec.unlockOffsetMs
        ? BigInt(Date.now() + spec.unlockOffsetMs)
        : 0n;
    const tx = new Transaction();
    const cap = tx.moveCall({
      target: `${PACKAGE_ID}::form::create_form`,
      arguments: [
        tx.pure.string(schemaBlob),
        tx.pure.string(metaBlob),
        tx.pure.u8(spec.tier),
        tx.pure.u8(spec.thresholdN ?? 0),
        tx.pure.u8(spec.thresholdM ?? 0),
        tx.pure.u64(unlockMs),
        tx.pure.string(""),
        tx.pure.vector("address", []),
        tx.object(
          Inputs.SharedObjectRef({
            objectId: SUI_CLOCK_OBJECT_ID,
            initialSharedVersion: 1,
            mutable: false,
          }),
        ),
      ],
    });
    tx.transferObjects([cap], tx.pure.address(addr));
    const t = await exec(client, kp, tx, `create_form(${spec.key})`);
    const shared = t.effects.changedObjects.find(
      (c: {
        idOperation?: string;
        outputOwner?: { $kind?: string };
        objectId: string;
      }) => c.idOperation === "Created" && c.outputOwner?.$kind === "Shared",
    );
    if (!shared) throw new Error(`${spec.key}: no shared Form in effects`);
    created.push({
      key: spec.key,
      title: spec.title,
      formId: shared.objectId,
      tier: spec.tier,
    });
    console.log(`✓ form ${spec.key} (tier ${spec.tier}) → ${shared.objectId}`);
  }
  console.log("");

  // 3) Submissions
  for (const f of created) {
    const spec = FORMS.find((s) => s.key === f.key)!;
    // Warm the grpc client's object cache so tx.object() resolves the
    // shared Form's mutability from chain (matches seedSubmissions.ts —
    // skipping this makes the resolver mis-mark shared inputs).
    await client.getObject({ objectId: f.formId, include: { json: true } });
    for (let i = 0; i < SUBS_PER_FORM; i++) {
      const payload = {
        schemaVersion: 1,
        answers: buildAnswers(spec.fields, { images: [], imgBlobs, vidBlob }),
        submittedAt: new Date().toISOString(),
      };
      const blob = await uploadJson(payload);
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::submission::submit`,
        arguments: [
          tx.object(f.formId),
          tx.pure.string(blob),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });
      const t = await exec(client, kp, tx, `submit(${f.key}#${i})`);
      console.log(
        `  · ${f.key} submission ${i + 1}/${SUBS_PER_FORM}  ${t.digest.slice(0, 12)}…`,
      );
    }
  }
  console.log("");

  // 4) Bounty on the first form (funds the Bounty TVL KPI)
  await new Promise((r) => setTimeout(r, 2500));
  const caps = (await client.listOwnedObjects({
    owner: addr,
    type: `${PACKAGE_ID}::form::FormOwnerCap`,
    include: { json: true },
    limit: 200,
  })) as unknown as {
    objects: { objectId: string; json?: { form_id?: string } }[];
  };
  const firstForm = created[0];
  const capForFirst = caps.objects.find(
    (c) => c.json?.form_id === firstForm.formId,
  );
  if (capForFirst) {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(BOUNTY_MIST)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::bounty::create_bounty`,
      arguments: [tx.object(capForFirst.objectId), coin, tx.pure.u8(0)],
    });
    const t = await exec(client, kp, tx, "create_bounty");
    console.log(
      `✓ bounty ${(Number(BOUNTY_MIST) / 1e9).toFixed(3)} SUI on ${firstForm.key}  ${t.digest.slice(0, 12)}…`,
    );
  }

  // 5) Reputation (mint + self-issue + claim one credit)
  let rep = (await client.listOwnedObjects({
    owner: addr,
    type: `${PACKAGE_ID}::reputation::Reputation`,
    include: { json: true },
    limit: 1,
  })) as unknown as { objects: { objectId: string }[] };
  if (rep.objects.length === 0) {
    const m = new Transaction();
    m.moveCall({ target: `${PACKAGE_ID}::reputation::mint`, arguments: [] });
    await exec(client, kp, m, "reputation.mint");
    await new Promise((r) => setTimeout(r, 2500));
    rep = (await client.listOwnedObjects({
      owner: addr,
      type: `${PACKAGE_ID}::reputation::Reputation`,
      include: { json: true },
      limit: 1,
    })) as unknown as { objects: { objectId: string }[] };
  }
  if (rep.objects.length > 0 && caps.objects[0]) {
    const issue = new Transaction();
    issue.moveCall({
      target: `${PACKAGE_ID}::reputation::issue_credit`,
      arguments: [
        issue.object(caps.objects[0].objectId),
        issue.pure.address(addr),
        issue.pure.u64(25),
      ],
    });
    await exec(client, kp, issue, "issue_credit");
    await new Promise((r) => setTimeout(r, 2500));
    const tickets = (await client.listOwnedObjects({
      owner: addr,
      type: `${PACKAGE_ID}::reputation::CreditTicket`,
      include: { json: true },
      limit: 10,
    })) as unknown as { objects: { objectId: string }[] };
    if (tickets.objects.length > 0) {
      const claim = new Transaction();
      for (const tk of tickets.objects) {
        claim.moveCall({
          target: `${PACKAGE_ID}::reputation::claim_credit`,
          arguments: [
            claim.object(tk.objectId),
            claim.object(rep.objects[0].objectId),
          ],
        });
      }
      await exec(client, kp, claim, "claim_credit");
      console.log(`✓ reputation seeded (${tickets.objects.length} credit)`);
    }
  }

  console.log("\n✨ Showcase seeded on mainnet. Forms:");
  for (const f of created) {
    console.log(`   ${f.title}`);
    console.log(`     https://echo-forms.wal.app/forms/${f.formId}`);
  }
}

main().catch((e) => {
  console.error("✗ seed-showcase failed:", e);
  process.exit(1);
});

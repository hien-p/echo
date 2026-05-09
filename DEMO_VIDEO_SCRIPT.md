# Echo · Demo video script (under 3 minutes)

Target ~2:50 of recording so you have ~10s of buffer for upload.
Structured to hit each Walrus Sessions 2 judging criterion in order:
**Functionality → Walrus → UX → Admin dashboard (bonus) → Seal (extra credit)**.

Open Chrome at <https://echo-20u.pages.dev> with the publish admin wallet
already connected and **Demo admin off**. Have a screenshot file on your
desktop ready to drag in.

---

## Section 1 · Pitch + functionality (0:00 – 0:25)

**Show:** the homepage at `/`.

**Voice / overlay:**

> Echo is a Walrus-native form platform for the Sui ecosystem. Schemas
> and submissions live on Walrus; encryption tiers are enforced by Seal;
> gas is sponsored by Enoki so respondents need zero SUI. Five privacy
> tiers, real m-of-n threshold, RAG over decrypted answers, and a
> private admin dashboard — all on chain.

Click the **"Help shape Echo"** card.

---

## Section 2 · Submission with markdown + image to Walrus (0:25 – 1:10)

**Show:** the feedback form at
`/forms/0x1f461854bdf96c46c54610a1c1a6bb3062033ce27ac3aa8755534b8aeaa132d8`.

Fill the rating (4 stars), check a couple of "what did you use" boxes.

In the **rich-text answer**:

- Type `## Echo feels surprisingly polished`
- Hit Enter, type `Things that worked:` then Enter
- Type `- markdown editor` then Enter, `- drop-image upload to Walrus`
- **Drag a screenshot from your desktop into the editor**.
  Voice: _"Drag-drop a screenshot — bytes go straight to the Walrus
  testnet publisher, an `![alt](aggregator-url)` markdown tag inserts at
  the cursor. Zero gas, zero proxy."_
- Click the **Preview** tab → show the rendered output with the image
  inline.

Toggle **Submit anonymously**. Voice:

> Anonymous mode: my wallet signs a one-time nullifier; only the 32-byte
> hash hits chain — never my address. The chain enforces one anonymous
> submit per wallet per form, so I can't double-vote.

Click **Submit**. Show the gas-sponsored confirmation digest.

---

## Section 3 · UX polish + Walrus presence (1:10 – 1:35)

After submit, navigate to the form's **admin** tab. Pause for ~2 seconds
on the header.

Voice (point at the **🛡 Sui · Walrus · Seal** TrustBadge in the header):

> Sui for the on-chain anchor, Walrus for the bytes, Seal for the
> encryption — visible from every page so judges don't have to read the
> source.

Hover over the chip — popover explains the no-vendor-trust property.

Then point at the **"On Walrus: Schema 0x… ↗ · Metadata 0x… ↗"** row
under the form title. Click the **↗** next to a blob id — the raw bytes
load from the public Walrus aggregator in a new tab. Voice:

> Schema, metadata, every submission payload — content-addressed Walrus
> blobs anyone can fetch from any aggregator. Echo can disappear
> tomorrow; the data stays readable.

---

## Section 4 · Private admin dashboard (the bonus) (1:35 – 2:15)

Click **Dashboard** in the header.

The page is locked. Voice:

> The dashboard is gated by Seal — the wallet has to prove it holds at
> least one FormOwnerCap before any submissions render.

Click **Unlock with Seal**, sign the SessionKey personal message.
Dashboard renders.

Voice while gesturing across the layout:

> Cross-form triage queue. Sidebar groups every form I own by privacy
> tier. Submissions list collapses to one line each — status pill,
> form, submitter, time. Status tags cycle on click; the inline metric
> strip filters by status. Bulk CSV export of any filtered slice.

Click the **Compliance · 2-of-2 sealed bid (multisig demo)** form in
the sidebar.

Detail panel opens. Point at the chips:

> Members ACL — owner plus co-admin, both resolved through SuiNS.
> Approvals badge: **2 of 2 approvals · unlocked**, polled live from
> on-chain ApprovalPosted events. Recent activity tail shows the actual
> Sui txs that produced this state.

---

## Section 5 · Seal extra credit + real m-of-n (2:15 – 2:50)

Click **admin →** on the multisig form's card. The admin page opens.

Voice:

> This form is encrypted under a real **multi-signature** Seal scheme.
> Each admin posted an on-chain ApprovalWitness; once both witnesses
> exist, anyone with their object IDs can finalize decrypt — no single
> party holds the data.

Show the green banner **"Multi-admin threshold · 2/2 approvals · data is
decryptable by anyone holding the witness IDs."**

Click **Reveal all** — server signs the SessionKey, fetches Seal shares,
decrypts every encrypted submission. Show the plaintext rows materialize.

Voice:

> Five privacy tiers in production: Public, AdminOnly, real
> multi-signature m-of-n threshold, time-locked, conditional. The whole
> thing is built to ship to Walrus Sites — `pnpm build:walrus` produces
> a 3.8 MB static SPA right now. Try it at
> echo-20u.pages.dev — and please leave real feedback so we can ship
> v0.4.

End on the URL.

---

## Recording + upload commands

Record at 1280×800 with QuickTime / Loom / Screen Studio. Export as MP4.

Upload to Walrus testnet publisher:

```bash
# replace path/to/echo-demo.mp4
curl -sX PUT "https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=53" \
  -H "content-type: application/octet-stream" \
  --data-binary "@path/to/echo-demo.mp4" \
  | jq .

# Use the returned blobId in the share URL:
# https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>
```

`epochs=53` ≈ 1 year — good for hackathon judging.

Submission link to paste into the Airtable:

```
Demo video (Walrus testnet aggregator):
https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>
```

---

## Live demo URLs (testnet, current as of 2026-05-09)

| What                              | URL                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Home                              | https://echo-20u.pages.dev                                                                                |
| Feedback form (Public)            | https://echo-20u.pages.dev/forms/0x1f461854bdf96c46c54610a1c1a6bb3062033ce27ac3aa8755534b8aeaa132d8       |
| AdminOnly demo                    | https://echo-20u.pages.dev/forms/0x1f7c0af08411366f712f8b69998fce1c61463c44c4d403c2857ff2aaf8dd7b5d/admin |
| TimeLocked demo                   | https://echo-20u.pages.dev/forms/0x98146a19e1cffd93919061024a5fdf24893fddda05c75f9e622d703cbf7a4af9/admin |
| **Multisig 2-of-2 (m-of-n live)** | https://echo-20u.pages.dev/forms/0xdd1c89447d81cbdf326d7a4237589d78b1e40c48827851d19a2af43657749591/admin |
| Dashboard (Seal-gated)            | https://echo-20u.pages.dev/dashboard                                                                      |
| Insights / RAG                    | https://echo-20u.pages.dev/insights                                                                       |
| Devlog                            | https://echo-20u.pages.dev/logs                                                                           |
| Move package                      | `0xf7e9261724da6c6ae4869bbf623ead796ea31f6a90ea8dcdb30d35568870763c`                                      |

---

## Filming tips

- **Disable browser notifications** — no Slack popups mid-recording.
- **Hide the bookmarks bar** — Cmd+Shift+B.
- **Pre-warm prod** — load each page once before hitting record so cold
  Worker startup doesn't add latency to the demo.
- **Anonymous nullifier already used?** — if you submitted anonymously
  before from this wallet, the second attempt aborts with the friendly
  "you've already submitted" toast. Pick a fresh wallet OR submit named
  on the recorded run.
- **Hard-refresh the dashboard** before recording — CF Pages CDN caches
  the bundle, and the new sidebar layout doesn't appear until the new
  bundle loads.

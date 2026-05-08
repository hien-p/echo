# Echo · Demo video script (under 3 minutes)

Target ~2:45 of recording so you have ~15s of buffer for upload.

Open Chrome at <https://echo-20u.pages.dev> with the publish admin wallet
already connected and Demo admin **off**. Have a screenshot file on your
desktop ready to drag in.

---

## Section 1 · Pitch + landing (0:00 – 0:25)

**Show:** the homepage at `/`.

**Voice / overlay:**

> Echo is a Walrus-native form platform for the Sui ecosystem. Forms,
> schemas, and submissions live on Walrus; encryption tiers are enforced
> by Seal; gas is sponsored by Enoki so respondents need zero SUI. Built
> for Walrus Sessions.

Click the amber **"Help shape Echo · leave us feedback"** card.

---

## Section 2 · Real submission with markdown + image (0:25 – 1:10)

**Show:** the feedback form `/forms/0x02750d97…`.

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

## Section 3 · Encrypted demo + admin reveal (1:10 – 1:55)

Click the **Demo admin** toggle in the header.

Voice:

> Demo admin mode lets visitors browse encrypted forms without a wallet.
> The server holds a designated demo key for showcase forms only — real
> users' forms stay wallet-gated.

Navigate to **My forms** → click the **"Compensation pulse (AdminOnly demo)"** form.

Show the admin page with the amber demo banner + 3 encrypted submissions.
Click **Reveal all (3)**. Voice:

> One click. Server signs the SessionKey, fetches Seal shares from two
> Mysten testnet key servers, decrypts every row in parallel. Two-second
> round-trip.

Show the rows with plaintext salaries + concerns + churn-risk choices.

---

## Section 4 · Insights / RAG (1:55 – 2:30)

Click **Insights** in the header.

Pick the same form from the dropdown. Type:

> Tell me what employees said about burnout.

Voice:

> Memwal indexed every decrypted submission into a private namespace.
> OpenRouter routes the question through gpt-4o-mini with the recalled
> memories as context — answers cite individual submissions verbatim,
> ~$0.0001 per query.

Show the RAG answer citing `[submission 0x…]` with quoted text.

---

## Section 5 · Wrap (2:30 – 2:55)

Cut to the home page → click **/logs**.

Voice:

> Five privacy tiers, anonymous nullifiers, multi-admin caps, drag-drop
> image upload, RAG over encrypted submissions, plus a self-hosted
> devlog of every commit. Walrus-native end to end. Try it at
> echo-20u.pages.dev — and please leave us real feedback so we can
> ship v0.3.

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

## Filming tips

- **Disable browser notifications** — no Slack popups mid-recording.
- **Hide the bookmarks bar** — Cmd+Shift+B.
- **Pre-warm prod** — load each page once before hitting record so cold
  Worker startup doesn't add latency to the demo.
- **Anonymous nullifier already used?** — if you submitted anonymously
  before from this wallet, the second attempt aborts with the friendly
  "you've already submitted" toast. Pick a fresh wallet OR submit named
  on the recorded run.

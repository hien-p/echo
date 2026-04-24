import express from "express";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { config } from "./config";
import { suiClient } from "./suiClient";
import { SuiParsedData } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";

export const app = express();
const port = config.PORT;

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Counter API",
      version: "1.0.0",
      description: "A simple Express API for Sui Counter",
    },
    servers: [{ url: `http://localhost:${port}` }],
  },
  apis: ["./src/index.ts"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     responses:
 *       200:
 *         description: Server health status
 */
app.get("/health", (req, res) => {
  res.send({
    SUI_FULLNODE_URL: config.SUI_FULLNODE_URL,
    PACKAGE_ID: config.PACKAGE_ID,
    COUNTER_ID: config.COUNTER_ID,
    ADMIN_SECRET_KEY: !!config.ADMIN_SECRET_KEY,
    PORT: config.PORT,
  });
});

/**
 * @swagger
 * /counter:
 *   get:
 *     summary: Get current counter value
 *     responses:
 *       200:
 *         description: Current counter value
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 value:
 *                   type: integer
 */
app.get("/counter", async (req, res) => {
  const counter = await suiClient.getObject({
    id: config.COUNTER_ID,
    options: { showContent: true },
  });
  const content = counter.data?.content as Extract<
    SuiParsedData,
    { dataType: "moveObject" }
  >;
  const { value } = content.fields as { value: string };
  res.json({ value: parseInt(value, 10) });
});

/**
 * @swagger
 * /increment:
 *   post:
 *     summary: Increment the counter
 *     responses:
 *       200:
 *         description: Counter incremented successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 digest:
 *                   type: string
 *       500:
 *         description: Transaction failed
 */
app.post("/increment", async (req, res) => {
  const privKeyArray = Uint8Array.from(
    Array.from(fromBase64(config.ADMIN_SECRET_KEY)),
  );
  const keypair = Ed25519Keypair.fromSecretKey(
    Uint8Array.from(privKeyArray).slice(1),
  );
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.PACKAGE_ID}::counter::increment`,
    arguments: [tx.object(config.COUNTER_ID)],
  });
  const { effects } = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  if (effects?.status.status === "success") {
    res.json({ success: true, digest: effects.transactionDigest });
  } else {
    res.status(500).json({ effects });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

import { NextResponse } from "next/server";
import { suiClient } from "../suiClient";
import { serverConfig } from "@/config/serverConfig";
import { SuiParsedData } from "@mysten/sui/client";

export const revalidate = 1;

/**
 * @swagger
 * /api/counter:
 *   get:
 *     summary: Get current counter value
 *     description: Returns the current value of the counter from the Sui blockchain
 *     tags: [Counter]
 *     responses:
 *       200:
 *         description: Current counter value
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CounterResponse"
 */
export const GET = async () => {
  const counter = await suiClient.getObject({
    id: serverConfig.COUNTER_ID,
    options: { showContent: true },
  });
  const content = counter.data?.content as Extract<
    SuiParsedData,
    { dataType: "moveObject" }
  >;
  const { value } = content.fields as { value: string };

  return NextResponse.json({ value: parseInt(value, 10) });
};

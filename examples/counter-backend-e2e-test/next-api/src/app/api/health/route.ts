import { serverConfig } from "@/config/serverConfig";
import { NextResponse } from "next/server";

export const revalidate = 1;

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns server configuration status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fullnode:
 *                   type: string
 *                   description: Sui fullnode URL
 *                 packageId:
 *                   type: string
 *                   description: Package ID
 *                 counterId:
 *                   type: string
 *                   description: Counter object ID
 *                 secretKey:
 *                   type: boolean
 *                   description: Whether secret key is configured
 */
export const GET = async () => {
  return NextResponse.json({
    fullnode: serverConfig.SUI_FULLNODE_URL,
    packageId: serverConfig.PACKAGE_ID,
    counterId: serverConfig.COUNTER_ID,
    secretKey: !!serverConfig.ADMIN_SECRET_KEY,
  });
};

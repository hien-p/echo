/** The zod schema that is used to parse the env variables.
 * By using zod, we ensure that any errors will be caught at build time.
 */

import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export const configSchema = z.object({
  SUI_FULLNODE_URL: z.url(),
  PACKAGE_ID: z.string(),
  COUNTER_ID: z.string(),
  ADMIN_SECRET_KEY: z.string(),
  PORT: z.string().optional(),
});

export const config = configSchema.parse({
  SUI_FULLNODE_URL: process.env.SUI_FULLNODE_URL,
  PACKAGE_ID: process.env.PACKAGE_ID,
  COUNTER_ID: process.env.COUNTER_ID,
  ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY,
  PORT: process.env.PORT || "3001",
});

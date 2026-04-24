import { SuiClient } from "@mysten/sui/client";
import { config } from "./config";

export const suiClient = new SuiClient({
  url: config.SUI_FULLNODE_URL,
});

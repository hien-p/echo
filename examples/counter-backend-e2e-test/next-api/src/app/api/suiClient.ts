import { serverConfig } from "@/config/serverConfig";
import { SuiClient } from "@mysten/sui/client";

export const suiClient = new SuiClient({
  url: serverConfig.SUI_FULLNODE_URL,
});

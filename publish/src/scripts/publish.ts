import { ENV } from "../env";
import { getAddress } from "../utils/getAddress";
import { getPublishBytes } from "../utils/getPublishBytes";
import { getSigner } from "../utils/getSigner";
import { fromBase64 } from "@mysten/sui/utils";
import { execSync } from "node:child_process";
import * as fs from "fs";
import path from "node:path";
import { SuiGrpcClient } from "@mysten/sui/grpc";

/**
 * Publishes the specified Move package to the specified Sui network.
 * Stores the response details in publish.res.json.
 * We can further automate parsing the response based on the needs of each project.
 */
export const publish = async () => {
  if (!ENV.MOVE_PACKAGE_PATH) {
    throw new Error("MOVE_PACKAGE_PATH is not defined in the .env");
  }
  if (!ENV.ADMIN_SECRET_KEY) {
    throw new Error("ADMIN_SECRET_KEY is not defined in the .env");
  }
  const suiClient = new SuiGrpcClient({
    network: ENV.SUI_NETWORK,
    baseUrl: ENV.SUI_FULLNODE_URL,
  });
  const signer = getSigner(ENV.ADMIN_SECRET_KEY);
  const address = getAddress(ENV.ADMIN_SECRET_KEY);
  const unsignedBytes = await getPublishBytes({
    packagePath: ENV.MOVE_PACKAGE_PATH,
    suiClient,
    sender: address,
    exec: execSync as any,
  });
  const { bytes, signature } = await signer.signTransaction(
    fromBase64(unsignedBytes),
  );
  const resp = await suiClient.executeTransaction({
    transaction: fromBase64(bytes),
    signatures: [signature],
    include: {
      effects: true,
    },
  });
  if (resp.FailedTransaction) {
    console.error("Publish transaction failed");
    console.error(
      JSON.stringify(resp.FailedTransaction.effects.status.error, null, 2),
    );
    return;
  }
  console.log("Publish transaction successful");
  if (!fs.existsSync("data")) {
    fs.mkdirSync("data");
  }
  fs.writeFileSync(
    ["data", "publish.json"].join(path.sep),
    JSON.stringify(resp.Transaction, null, 2),
  );
  console.log("Response details stored in data/publish.json");
};

publish();

import type { TestProject } from "vitest/node";
import { GenericContainer, Network, PullPolicy } from "testcontainers";
import { resolve } from "path";
import { MOVE_PACKAGE_PATH } from "./config";
import { execCommand } from "./execCommand";
import { requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SuiClientTypes } from "@mysten/sui/client";
import { fromBase64 } from "@mysten/sui/utils";
import {
  Account,
  getNewAccount,
  loadAccountKeypair,
} from "../src/utils/getNewAccount";
import { getPublishBytes } from "../../publish/src/utils/getPublishBytes";

// extend Vitest context so tests can read something
declare module "vitest" {
  export interface ProvidedContext {
    localnetPort: number;
    graphqlPort: number;
    faucetPort: number;
    suiToolsContainerId: string;
    adminAccount: Account;
    objectChanges: SuiClientTypes.ChangedObject[];
  }
}

const SUI_TOOLS_TAG =
  process.env.SUI_TOOLS_TAG ||
  (process.arch === "arm64"
    ? "bee119a9c1801d87f4d3b4894c6b93c530660f85-arm64"
    : "bee119a9c1801d87f4d3b4894c6b93c530660f85");

export default async function setup(project: TestProject) {
  console.log("Setting up the testing environment...");
  const network = await new Network().start();
  console.log("Setting up Postgres...");
  const pg = await new GenericContainer("postgres")
    .withEnvironment({
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "postgrespw",
      POSTGRES_DB: "sui_indexer_v2",
    })
    .withCommand(["-c", "max_connections=500"])
    .withExposedPorts(5432)
    .withNetwork(network)
    .withPullPolicy(PullPolicy.alwaysPull())
    .start();
  console.log("Setting up Sui localnet...");
  const localnet = await new GenericContainer(
    `mysten/sui-tools:${SUI_TOOLS_TAG}`,
  )
    .withCommand([
      "sui",
      "start",
      "--with-faucet",
      "--force-regenesis",
      "--with-graphql",
      `--with-indexer=postgres://postgres:postgrespw@${pg.getIpAddress(
        network.getName(),
      )}:5432/sui_indexer_v2`,
    ])
    .withCopyDirectoriesToContainer([
      {
        source: resolve(__dirname, MOVE_PACKAGE_PATH.local),
        target: MOVE_PACKAGE_PATH.testContainer,
      },
    ])
    .withNetwork(network)
    .withExposedPorts(9000, 9123, 9124, 9125)
    .withLogConsumer((stream) => {
      stream.on("data", (data) => {
        console.log(data.toString());
      });
    })
    .start();

  const LOCALNET_PORT = localnet.getMappedPort(9000);
  const FAUCET_PORT = localnet.getMappedPort(9123);
  const SUI_TOOLS_CONTAINER_ID = localnet.getId();
  project.provide("localnetPort", LOCALNET_PORT);
  project.provide("graphqlPort", localnet.getMappedPort(9125));
  project.provide("faucetPort", FAUCET_PORT);
  project.provide("suiToolsContainerId", SUI_TOOLS_CONTAINER_ID);

  await execCommand({
    command: ["sui", "client", "--yes"],
    suiToolsContainerId: SUI_TOOLS_CONTAINER_ID,
  });

  console.log("Preparing admin account...");
  const suiClient = new SuiGrpcClient({
    network: "localnet",
    baseUrl: `http://localhost:${LOCALNET_PORT}`,
  });
  const admin = getNewAccount();
  // Reconstruct keypair locally for setup-time signing. Tests can't
  // rely on `admin.keypair` because Vitest serializes provide() values
  // to JSON, stripping class methods.
  const adminKeypair = loadAccountKeypair(admin);
  await requestSuiFromFaucetV2({
    host: `http://localhost:${FAUCET_PORT}`,
    recipient: admin.address,
  });

  console.log("Publishing Move package...");
  const unsignedBytes = await getPublishBytes({
    packagePath: MOVE_PACKAGE_PATH.testContainer,
    suiClient,
    sender: admin.address,
    exec: async (command) => {
      return execCommand({
        command: command.split(" "),
        suiToolsContainerId: SUI_TOOLS_CONTAINER_ID,
      });
    },
  });
  const { bytes, signature } = await adminKeypair.signTransaction(
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
    throw new Error(
      `Failed to publish Move package: ${JSON.stringify(
        resp.FailedTransaction,
        null,
        2,
      )}`,
    );
  }
  project.provide("adminAccount", admin);
  project.provide("objectChanges", resp.Transaction.effects.changedObjects);
  console.log("Testing environment is ready.");
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDAppKit } from "@mysten/dapp-kit-react";
import { Coins, Plus } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import {
  buildAddBountyFundsTx,
  buildBountyPayoutTx,
  buildCloseBountyTx,
  buildCreateBountyTx,
} from "@/lib/echo";

interface BountyPool {
  objectId: string;
  json: {
    form_id: string;
    mode: number;
    funds: string;
  };
}

interface BountyCreatedEvent {
  pool_id: string;
  form_id: string;
  mode: string;
}

const MODE_LABELS: Record<number, string> = {
  0: "Admin select",
  1: "Top K",
  2: "Quadratic",
};

const SUI_PER_MIST = BigInt(1_000_000_000);

export const BountyPanel = ({
  formId,
  formOwnerCapId,
  isOwner,
  callerAddress,
}: {
  formId: string;
  formOwnerCapId: string | null;
  isOwner: boolean;
  callerAddress: string;
}) => {
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const queryClient = useQueryClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;

  const [createAmount, setCreateAmount] = useState("0.5");
  const [topUpAmount, setTopUpAmount] = useState("0.1");
  const [payoutTo, setPayoutTo] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("0.1");

  const poolQuery = useQuery({
    queryKey: ["echo", "bounty-pool", formId],
    queryFn: async (): Promise<BountyPool | null> => {
      const events = await jsonRpcQueryEvents<BountyCreatedEvent>(
        clientConfig.SUI_FULLNODE_URL,
        `${packageId}::bounty::BountyCreated`,
      );
      const match = events.find((e) => e.form_id === formId);
      if (!match) return null;
      const resp = await suiClient.getObject({
        objectId: match.pool_id,
        include: { json: true },
      });
      return {
        objectId: match.pool_id,
        json: resp.object.json as BountyPool["json"],
      };
    },
    enabled: packageId.startsWith("0x") && formId.startsWith("0x"),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["echo", "bounty-pool", formId],
    });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!formOwnerCapId) throw new Error("Owner cap not found.");
      const tx = buildCreateBountyTx({
        packageId,
        formOwnerCapId,
        amountMist: suiToMist(createAmount),
        mode: 0,
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction")
        throw new Error("Create bounty failed.");
    },
    onSuccess: invalidate,
  });

  const topUpMutation = useMutation({
    mutationFn: async () => {
      if (!poolQuery.data) throw new Error("No bounty pool.");
      const tx = buildAddBountyFundsTx({
        packageId,
        poolId: poolQuery.data.objectId,
        amountMist: suiToMist(topUpAmount),
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction")
        throw new Error("Top up failed.");
    },
    onSuccess: invalidate,
  });

  const payoutMutation = useMutation({
    mutationFn: async () => {
      if (!formOwnerCapId) throw new Error("Owner cap not found.");
      if (!poolQuery.data) throw new Error("No bounty pool.");
      if (!payoutTo.startsWith("0x") || payoutTo.length < 10)
        throw new Error("Recipient must be a Sui address starting with 0x.");
      const tx = buildBountyPayoutTx({
        packageId,
        formOwnerCapId,
        poolId: poolQuery.data.objectId,
        recipient: payoutTo,
        amountMist: suiToMist(payoutAmount),
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction")
        throw new Error("Payout failed.");
    },
    onSuccess: invalidate,
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!formOwnerCapId) throw new Error("Owner cap not found.");
      if (!poolQuery.data) throw new Error("No bounty pool.");
      const tx = buildCloseBountyTx({
        packageId,
        formOwnerCapId,
        poolId: poolQuery.data.objectId,
        refundRecipient: callerAddress,
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction")
        throw new Error("Close failed.");
    },
    onSuccess: invalidate,
  });

  const muts = [createMutation, topUpMutation, payoutMutation, closeMutation];
  const errMsg = muts
    .map((m) => (m.error instanceof Error ? m.error.message : null))
    .find((m): m is string => !!m);

  return (
    <section className="border rounded p-4 bg-card flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-1">
        <Coins size={14} /> Bounty
      </h2>

      {poolQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : poolQuery.data ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <strong>Balance:</strong> {mistToSui(poolQuery.data.json.funds)} SUI
            · <strong>Mode:</strong>{" "}
            {MODE_LABELS[poolQuery.data.json.mode] ?? "?"}
          </p>

          <div className="flex gap-2 items-center text-sm">
            <input
              type="text"
              className="border rounded px-2 py-1 w-24"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
            />
            <span>SUI</span>
            <button
              type="button"
              disabled={topUpMutation.isPending}
              onClick={() => topUpMutation.mutate()}
              className={cn(
                "border rounded px-3 py-1",
                topUpMutation.isPending ? "opacity-60" : "hover:bg-accent",
              )}
            >
              Top up
            </button>
          </div>

          {isOwner && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Pay out
              </p>
              <input
                type="text"
                className="border rounded px-2 py-1"
                placeholder="Recipient address (0x…)"
                value={payoutTo}
                onChange={(e) => setPayoutTo(e.target.value)}
              />
              <div className="flex gap-2 items-center text-sm">
                <input
                  type="text"
                  className="border rounded px-2 py-1 w-24"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                />
                <span>SUI</span>
                <button
                  type="button"
                  disabled={payoutMutation.isPending}
                  onClick={() => payoutMutation.mutate()}
                  className={cn(
                    "border rounded px-3 py-1",
                    payoutMutation.isPending ? "opacity-60" : "hover:bg-accent",
                  )}
                >
                  Pay out
                </button>
              </div>
              <button
                type="button"
                disabled={closeMutation.isPending}
                onClick={() => closeMutation.mutate()}
                className="text-xs text-destructive underline w-fit"
              >
                Close bounty + refund remaining to me
              </button>
            </div>
          )}
        </div>
      ) : isOwner ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            No bounty yet. Stake some SUI to reward submissions.
          </p>
          <div className="flex gap-2 items-center text-sm">
            <input
              type="text"
              className="border rounded px-2 py-1 w-24"
              value={createAmount}
              onChange={(e) => setCreateAmount(e.target.value)}
            />
            <span>SUI</span>
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className={cn(
                "border rounded px-3 py-1 flex items-center gap-1",
                createMutation.isPending ? "opacity-60" : "hover:bg-accent",
              )}
            >
              <Plus size={14} /> Create bounty
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No bounty on this form yet.
        </p>
      )}

      {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}
    </section>
  );
};

function suiToMist(suiStr: string): bigint {
  const sui = parseFloat(suiStr);
  if (!Number.isFinite(sui) || sui <= 0) throw new Error("Invalid SUI amount.");
  return BigInt(Math.floor(sui * 1_000_000_000));
}
function mistToSui(mistStr: string): string {
  const mist = BigInt(mistStr);
  const whole = mist / SUI_PER_MIST;
  const frac = mist % SUI_PER_MIST;
  return `${whole}.${frac.toString().padStart(9, "0").replace(/0+$/, "") || "0"}`;
}

async function jsonRpcQueryEvents<T>(
  fullnodeUrl: string,
  moveEventType: string,
): Promise<T[]> {
  const resp = await fetch(fullnodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryEvents",
      params: [{ MoveEventType: moveEventType }, null, 200, true],
    }),
  });
  const data = (await resp.json()) as {
    result?: { data?: Array<{ parsedJson?: T }> };
  };
  return (data.result?.data ?? [])
    .map((e) => e.parsedJson)
    .filter((p): p is T => !!p);
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Award, Plus, Trophy } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { buildClaimCreditTx, buildMintReputationTx } from "@/lib/echo";

interface OwnedRep {
  objectId: string;
  json: {
    holder: string;
    score: string;
    submission_count: string;
  };
}

interface OwnedTicket {
  objectId: string;
  json: {
    form_id: string;
    recipient: string;
    score_delta: string;
  };
}

interface CreditClaimedEvent {
  rep_id: string;
  holder: string;
  new_score: string;
}

export const ReputationDashboard = () => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const queryClient = useQueryClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;

  const repQuery = useQuery({
    queryKey: ["echo", "reputation", account?.address],
    queryFn: async () => {
      if (!account) return { rep: null, tickets: [] as OwnedTicket[] };
      const [reps, tickets] = await Promise.all([
        suiClient.listOwnedObjects({
          owner: account.address,
          type: `${packageId}::reputation::Reputation`,
          include: { json: true },
          limit: 50,
        }),
        suiClient.listOwnedObjects({
          owner: account.address,
          type: `${packageId}::reputation::CreditTicket`,
          include: { json: true },
          limit: 100,
        }),
      ]);
      const repList = reps.objects as unknown as OwnedRep[];
      const ticketList = tickets.objects as unknown as OwnedTicket[];
      return { rep: repList[0] ?? null, tickets: ticketList };
    },
    enabled: !!account?.address && packageId.startsWith("0x"),
  });

  const leaderboardQuery = useQuery({
    queryKey: ["echo", "leaderboard"],
    queryFn: async () => {
      const events = await jsonRpcQueryEvents<CreditClaimedEvent>(
        clientConfig.SUI_FULLNODE_URL,
        `${packageId}::reputation::CreditClaimed`,
      );
      // Track latest new_score per holder.
      const latest = new Map<string, number>();
      for (const e of events) {
        const score = Number(e.new_score);
        const prev = latest.get(e.holder) ?? 0;
        if (score > prev) latest.set(e.holder, score);
      }
      return [...latest.entries()]
        .map(([holder, score]) => ({ holder, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    },
    enabled: packageId.startsWith("0x"),
  });

  const mintMutation = useMutation({
    mutationFn: async () => {
      const tx = buildMintReputationTx({ packageId });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction") throw new Error("Mint failed.");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["echo", "reputation", account?.address],
      }),
  });

  const claimMutation = useMutation({
    mutationFn: async ({
      ticketId,
      reputationId,
    }: {
      ticketId: string;
      reputationId: string;
    }) => {
      const tx = buildClaimCreditTx({ packageId, ticketId, reputationId });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction")
        throw new Error("Claim failed.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["echo", "reputation", account?.address],
      });
      queryClient.invalidateQueries({ queryKey: ["echo", "leaderboard"] });
    },
  });

  if (!account) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a wallet to see your reputation.
      </p>
    );
  }

  const rep = repQuery.data?.rep ?? null;
  const tickets = repQuery.data?.tickets ?? [];

  return (
    <div className="flex flex-col gap-md">
      <section className="border rounded p-4 bg-card flex items-center gap-3">
        <Award size={32} className="text-amber-600" />
        {rep ? (
          <div className="flex flex-col gap-1 flex-1">
            <p className="text-sm">
              <strong>Score:</strong> {rep.json.score} ·{" "}
              <strong>Submissions credited:</strong> {rep.json.submission_count}
            </p>
            <p className="text-xs text-muted-foreground">
              Badge id: <code>{rep.objectId.slice(0, 18)}…</code>
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 justify-between">
            <p className="text-sm text-muted-foreground">
              You don&apos;t have a reputation badge yet.
            </p>
            <button
              type="button"
              onClick={() => mintMutation.mutate()}
              disabled={mintMutation.isPending}
              className={cn(
                "border rounded px-3 py-1 text-sm flex items-center gap-1",
                mintMutation.isPending ? "opacity-60" : "hover:bg-accent",
              )}
            >
              <Plus size={14} /> Mint badge
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          Unclaimed tickets ({tickets.length})
        </h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tickets in your inventory. Form owners issue these via{" "}
            <code>issue_credit</code> when your submission is rated quality.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tickets.map((t) => (
              <li
                key={t.objectId}
                className="border rounded p-3 bg-card flex items-center gap-2 text-sm"
              >
                <span>
                  +{t.json.score_delta} from form{" "}
                  <code>{t.json.form_id.slice(0, 10)}…</code>
                </span>
                <button
                  type="button"
                  className={cn(
                    "ml-auto border rounded px-3 py-1",
                    rep && !claimMutation.isPending
                      ? "hover:bg-accent"
                      : "opacity-60 cursor-not-allowed",
                  )}
                  disabled={!rep || claimMutation.isPending}
                  onClick={() =>
                    rep &&
                    claimMutation.mutate({
                      ticketId: t.objectId,
                      reputationId: rep.objectId,
                    })
                  }
                >
                  {rep ? "Claim" : "Mint badge first"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-1">
          <Trophy size={14} /> Top respondents
        </h2>
        {leaderboardQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : leaderboardQuery.data && leaderboardQuery.data.length > 0 ? (
          <ol className="flex flex-col gap-1 text-sm">
            {leaderboardQuery.data.map((row, i) => (
              <li
                key={row.holder}
                className="flex items-center gap-2 border rounded p-2 bg-card"
              >
                <span className="text-muted-foreground w-6">#{i + 1}</span>
                <code className="flex-1">{row.holder.slice(0, 16)}…</code>
                <span className="font-medium">{row.score}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            No claims on chain yet.
          </p>
        )}
      </section>
    </div>
  );
};

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

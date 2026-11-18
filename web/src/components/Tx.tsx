import { useEffect, useState } from "react";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { base } from "wagmi/chains";
import type { Abi, TransactionReceipt } from "viem";
import { basescan } from "../lib/chain";
import { BUILDER_SUFFIX } from "../lib/builder";

export type TxRequest = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/** One button = one real transaction. Shows the wallet prompt, the pending tx with a BaseScan
 *  link, and the error in plain words. Nothing here pretends: the state comes from the chain. */
export function TxButton({
  label, request, onDone, disabled, kind = "primary", busyLabel,
}: {
  label: string;
  request: () => TxRequest | undefined;
  onDone?: (r: TransactionReceipt) => void;
  disabled?: boolean;
  kind?: "primary" | "ghost" | "danger";
  busyLabel?: string;
}) {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, data: hash, reset, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash, chainId: base.id });
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (receipt.data && onDone) onDone(receipt.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.data]);

  const busy = isPending || (!!hash && receipt.isLoading);
  const failed = receipt.data?.status === "reverted";

  async function go() {
    setError(undefined);
    reset();
    const req = request();
    if (!req) return;
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      await writeContractAsync({ ...req, chainId: base.id, dataSuffix: BUILDER_SUFFIX } as Parameters<typeof writeContractAsync>[0]);
    } catch (e) {
      setError(plainError(e));
    }
  }

  return (
    <div className="tx">
      <button className={`btn btn-${kind}`} disabled={!isConnected || disabled || busy} onClick={go}>
        {busy ? busyLabel ?? "Confirming…" : label}
      </button>
      {!isConnected && <span className="tx-note">Connect a wallet first</span>}
      {hash && (
        <a className="tx-note" href={basescan("tx", hash)} target="_blank" rel="noreferrer">
          {receipt.data ? (failed ? "Failed onchain" : "Confirmed") : "Sent"} · view on BaseScan ↗
        </a>
      )}
      {error && <span className="tx-error">{error}</span>}
    </div>
  );
}

export function plainError(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string };
  const msg = any.shortMessage || any.message || String(e);
  const reason = msg.match(/reverted with the following reason:\s*(.*)/)?.[1] || msg.match(/League: [^"\n]+|Factory: [^"\n]+|Coins: [^"\n]+/)?.[0];
  if (/User rejected|denied/i.test(msg)) return "You cancelled it in your wallet.";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH on Base to pay the network fee.";
  if (reason) return reason.replace(/^(League|Factory|Coins): /, "").replace(/^./, (c) => c.toUpperCase());
  return msg.split("\n")[0].slice(0, 160);
}

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { USDC } from "../lib/chain";
import { short, usd } from "../lib/format";

export function Wallet() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const bal = useReadContract({
    address: USDC, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  if (isConnected && address) {
    return (
      <div className="wallet">
        {bal.data !== undefined && <span className="wallet-bal">{usd(bal.data)} USDC</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => disconnect()} title="Disconnect">
          {short(address)}
        </button>
      </div>
    );
  }
  return (
    <div className="wallet">
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(!open)} disabled={isPending}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="wallet-menu">
          {connectors.map((c) => (
            <button key={c.uid} className="wallet-option" onClick={() => { connect({ connector: c }); setOpen(false); }}>
              {c.name === "Coinbase Wallet" ? "Coinbase Wallet or Smart Wallet (passkey)" : c.name === "Injected" ? "Browser wallet" : c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

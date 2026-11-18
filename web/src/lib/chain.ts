import { createConfig, fallback, http } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { createPublicClient } from "viem";

export const FACTORY = "0xde8bEbCeeAC160DeC0C09C2286a1d29a564ee997" as const;
export const COINS = "0xf84A05F17545f52914c82eB89b8aDb52e02770D6" as const;
export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const FACTORY_BLOCK = 59016290n;
export const STONKS_COIN_URL = "https://thestonks.exchange/t/";

/** Set VITE_RPC to a local fork (anvil --fork-url …) to try the app without real money.
 *  The app shows a "local fork" banner whenever it is set. */
export const FORK_RPC = import.meta.env.VITE_RPC as string | undefined;
const rpc = FORK_RPC ? http(FORK_RPC) : fallback([http("https://base-rpc.publicnode.com"), http("https://mainnet.base.org")]);

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [coinbaseWallet({ appName: "Hostile", preference: "all" }), injected()],
  transports: { [base.id]: rpc },
});

export const client = createPublicClient({ chain: base, transport: rpc, batch: { multicall: true } });
/** publicnode serves eth_getLogs over up to 50,000 blocks; mainnet.base.org does not. */
export const logsClient = createPublicClient({ chain: base, transport: FORK_RPC ? http(FORK_RPC) : http("https://base-rpc.publicnode.com") });

export const basescan = (kind: "tx" | "address" | "token", v: string) => `https://basescan.org/${kind}/${v}`;

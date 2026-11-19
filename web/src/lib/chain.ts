import { createConfig, fallback, http } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { createPublicClient } from "viem";

export * from "./addresses";


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

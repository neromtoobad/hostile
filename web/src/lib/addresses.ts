/** Deployed addresses on Base mainnet. No imports, so server code (the share-card function) can use
 *  them without pulling in the wallet libraries. */
export const FACTORY = "0xde8bEbCeeAC160DeC0C09C2286a1d29a564ee997" as const;
export const COINS = "0xf84A05F17545f52914c82eB89b8aDb52e02770D6" as const;
export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const FACTORY_BLOCK = 59016290n;
export const STONKS_COIN_URL = "https://thestonks.exchange/t/";

export const basescan = (kind: "tx" | "address" | "token", v: string) => `https://basescan.org/${kind}/${v}`;

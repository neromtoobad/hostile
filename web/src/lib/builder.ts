import { Attribution } from "ox/erc8021";

/** Base Builder Code (from base.dev → Settings → Builder Code). When VITE_BUILDER_CODE is set,
 *  every transaction the app sends carries it as an ERC-8021 data suffix, so Base can attribute
 *  the onchain activity to Hostile. The contracts ignore the extra bytes. Unset = no suffix. */
const code = (import.meta.env.VITE_BUILDER_CODE as string | undefined)?.trim();
export const BUILDER_SUFFIX = code ? Attribution.toDataSuffix({ codes: [code] }) : undefined;

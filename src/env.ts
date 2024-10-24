import { hexToBytes } from "@noble/hashes/utils";
import "dotenv/config";

function requiredEnv(name: string, message?: string) {
  if (!Deno.env.has(name)) throw new Error(message ?? `Missing ${name}`);
  return Deno.env.get(name)!;
}

const PRICE_PER_KIB = parseFloat(requiredEnv("PRICE_PER_KIB"));
const PRIVATE_KEY_HEX = requiredEnv("PRIVATE_KEY");
const NOSTR_RELAYS = requiredEnv("NOSTR_RELAYS")?.split(",");

// Money config
const MINT_URL = requiredEnv("MINT_URL");
const MINT_UNIT = Deno.env.get("MINT_UNIT") ?? "sat";
const PROFITS_PUBKEY = requiredEnv("PROFITS_PUBKEY");
const PROFIT_PAYOUT_THRESHOLD = parseInt(Deno.env.get("PROFIT_PAYOUT_THRESHOLD") ?? "25");

const UPSTREAM = Deno.env.get("UPSTREAM");

// service config (kind 0)
const SERVICE_NAME = Deno.env.get("SERVICE_NAME");
const SERVICE_ABOUT = Deno.env.get("SERVICE_ABOUT");
const SERVICE_PICTURE = Deno.env.get("SERVICE_PICTURE");

// Outbound network
const I2P_PROXY = Deno.env.get("I2P_PROXY");
const TOR_PROXY = Deno.env.get("TOR_PROXY");

// Inbound network
const CLEARNET_URL = Deno.env.get("CLEARNET_URL");
const TOR_URL = Deno.env.get("TOR_URL");
const I2P_URL = Deno.env.get("I2P_URL");

const PRIVATE_KEY = hexToBytes(PRIVATE_KEY_HEX);

// check required env
if (NOSTR_RELAYS.length === 0) throw new Error("At least one relay is required");

export {
  PRIVATE_KEY,
  NOSTR_RELAYS,
  UPSTREAM,
  MINT_URL,
  PROFITS_PUBKEY,
  PROFIT_PAYOUT_THRESHOLD,
  I2P_PROXY,
  TOR_PROXY,
  PRICE_PER_KIB,
  SERVICE_ABOUT,
  SERVICE_NAME,
  SERVICE_PICTURE,
  MINT_UNIT,
  CLEARNET_URL,
  TOR_URL,
  I2P_URL,
};

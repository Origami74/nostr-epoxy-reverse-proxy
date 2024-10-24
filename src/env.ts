import { hexToBytes } from "@noble/hashes/utils";
import "dotenv/config";

function requiredEnv(name: string, message?: string) {
  if (process.env[name] === undefined) throw new Error(message ?? `Missing ${name}`);
  return process.env[name];
}

function optionalEnv(name: string) {
  return process.env[name];
}

const PRICE_PER_KIB = parseFloat(requiredEnv("PRICE_PER_KIB"));
const PRIVATE_KEY_HEX = requiredEnv("PRIVATE_KEY");
const NOSTR_RELAYS = requiredEnv("NOSTR_RELAYS")?.split(",");

// Money config
const MINT_URL = requiredEnv("MINT_URL");
const MINT_UNIT = optionalEnv("MINT_UNIT") ?? "sat";
const PROFITS_PUBKEY = requiredEnv("PROFITS_PUBKEY");
const PROFIT_PAYOUT_THRESHOLD = parseInt(optionalEnv("PROFIT_PAYOUT_THRESHOLD") ?? "25");

const UPSTREAM = optionalEnv("UPSTREAM");

// service config (kind 0)
const SERVICE_NAME = optionalEnv("SERVICE_NAME");
const SERVICE_ABOUT = optionalEnv("SERVICE_ABOUT");
const SERVICE_PICTURE = optionalEnv("SERVICE_PICTURE");

// Outbound network
const I2P_PROXY = optionalEnv("I2P_PROXY");
const TOR_PROXY = optionalEnv("TOR_PROXY");

// Inbound network
const CLEARNET_URL = optionalEnv("CLEARNET_URL");
const TOR_URL = optionalEnv("TOR_URL");
const I2P_URL = optionalEnv("I2P_URL");

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

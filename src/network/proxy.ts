import { ProxyAgent } from "proxy-agent";
import { PacProxyAgent } from "pac-proxy-agent";
import { injectable } from "tsyringe";

import logger from "../logger.ts";

const I2P_PROXY = Deno.env.get("I2P_PROXY");
const PAC_PROXY = Deno.env.get("PAC_PROXY");
const TOR_PROXY = Deno.env.get("TOR_PROXY");

function buildPacURI() {
  const statements: string[] = [];

  if (I2P_PROXY) {
    statements.push(
      `
if (shExpMatch(host, "*.i2p"))
{
return "SOCKS5 ${I2P_PROXY}";
}
`.trim(),
    );
  }

  if (TOR_PROXY) {
    statements.push(
      `
if (shExpMatch(host, "*.onion"))
{
return "SOCKS5 ${TOR_PROXY}";
}
`.trim(),
    );
  }

  statements.push('return "DIRECT";');

  const PACFile = `
// SPDX-License-Identifier: CC0-1.0

function FindProxyForURL(url, host)
{
${statements.join("\n")}
}
`.trim();

  return "pac+data:application/x-ns-proxy-autoconfig;base64," + btoa(PACFile);
}

@injectable()
export default class OutboundNetwork {
  log = logger.extend("OutboundNetwork");
  agent: ProxyAgent | PacProxyAgent<string>;

  constructor() {
    if (PAC_PROXY) {
      this.log(`Using PAC proxy file`);
      this.agent = new PacProxyAgent(PAC_PROXY, { keepAlive: true });
    } else if (TOR_PROXY || I2P_PROXY) {
      if (TOR_PROXY) this.log("Tor connection enabled");
      if (I2P_PROXY) this.log("I2P connection enabled");

      this.agent = new PacProxyAgent(buildPacURI(), { keepAlive: true });
    } else this.agent = new ProxyAgent({ keepAlive: true });
  }
}

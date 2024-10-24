import { ProxyAgent } from "proxy-agent";
import { PacProxyAgent } from "pac-proxy-agent";
import { injectable } from "tsyringe";

import logger from "../logger.ts";
import { I2P_PROXY, TOR_PROXY } from "../env.ts";

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

export interface IOutboundNetwork {
  tor: boolean;
  i2p: boolean;
  clearnet: boolean;
  agent: ProxyAgent | PacProxyAgent<string>;
}

@injectable()
export default class OutboundNetwork implements IOutboundNetwork {
  private log = logger.extend("OutboundNetwork");
  agent: ProxyAgent | PacProxyAgent<string>;

  clearnet = true;
  tor = !!TOR_PROXY;
  i2p = !!I2P_PROXY;

  constructor() {
    if (TOR_PROXY || I2P_PROXY) {
      if (TOR_PROXY) this.log("Tor connection enabled");
      if (I2P_PROXY) this.log("I2P connection enabled");

      this.agent = new PacProxyAgent(buildPacURI(), { keepAlive: true });
    } else this.agent = new ProxyAgent({ keepAlive: true });
  }
}

NIP-301
======

Websocket Proxies (Epoxy)
-----------------------------------

`draft` `optional`

This NIP describes a method by which relays can proxy a websocket to another relay based on either pubkey or url.

## Client implementation

### Request definition
- `["PROXY", "<proxy_url>", "<min_delay_ms>", "<max_delay_ms>"]`

The arguments are the `PROXY` keyword first and second can be:

- `<proxy_url>` A relay address
- `<min_delay_ms>`/`<max_delay_ms>` A delay range for the proxy operator to hold your messages before forwarding.

The third argument is an optional `<auth_response>` argument which can be

## Proxy/Relay implementation

### Broadcast proxy

To announce it's service to the world, the proxy can broadcast a replaceable event of kind `18909` event announcing the proxy capability to the network:

Tags:
tag `n` for network, one or more.

tag `url` for url, at least one for every `n` tag.

tag `mint` for mints, one or more.

tag `price` for price per Min, followed by `unit` for price unit.

#### Example:

```json
{
  "kind": 18909,
  "tags": [
    [
      ["n", "tor"],
      ["n", "clearnet"],
      ["url", "https://juhanurmihxlp77nkq76byazcldy2hlmovfu2epvl5ankdibsot4csyd.onion/", "tor"],
      ["url", "wss://proxy.domain.com", "clearnet"],
      ["mint", "https://some.mint.xyz", "sat"],
      ["price", "0.01", "sat"]
    ]
  ],
  "content": "<See below>"
}
```

**Example Content:**

[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md#kinds) user metadata content:
```json
{
  "name": "Name of this Proxy",
  "about": "Description of this proxy",
  "picture": "https://domain.com/image.jpg"
}
```

#### No more funds
When the client goes over the agreed upon (data) limits the proxy can decide to disconnect the websocket.
In this case the websocket connection is closed with code `1000`.
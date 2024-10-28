# NIP-XX

## Relay proxying (epoxy)

`draft` `optional`

This NIP describes a method by which relays can proxy a websocket to another relay based on either pubkey or url.

## Motivation
A client may want to connect to a relay that is not directly accessible from the client's device or network. For example:

- A client is connected to a restricted network that only allows connections to the same geographical region, but wants to connect to a relay outside of that region.
- A client want to connect to a tor relay using a web-based nostr app, but cannot connect to the tor network in its web-browser.

## Client implementation

### Request definition
```json
["PROXY", "<proxy_url>", "<cashu_token>"]
["PROXY", "<proxy_pubkey>", "<cashu_token>"]
```

The arguments are the `PROXY` keyword first and second can be:

- `<proxy_url>` A relay address
- `<proxy_pubkey>` A public key of proxy or relay in hex format

The third argument `<cashu_token>` is an optional payment in the form of a cashu token.

WARNING:
If requests are not encrypted to a pubkey of the destination, the proxy server can send the traffic anywhere without the client being aware.

## Proxy/Relay implementation

### Broadcast proxy

To announce it's service to the world, the proxy can broadcast a replaceable event of kind `18909` event announcing the proxy capability to the network:

Tags:
tag `n` for network, one or more.

tag `url` for url, at least one for every `n` tag.

tag `mint` for mints, one or more.

tag `price` for price per KiB, followed by `unit` for price unit, at least one.

#### Example:

```json
{
  "kind": 18909,
  "tags": [
    [
      ["n", "tor"],
      ["n", "clearnet"],
      ["url", "http://juhanurmihxlp77nkq76byazcldy2hlmovfu2epvl5ankdibsot4csyd.onion/", "tor"],
      ["url", "wss://proxy.domain.com", "clearnet"],
      ["mint", "https://some.mint.xyz", "sat"],
      ["price", "0.01", "sat"]
    ]
  ],
  "content": "See below"
}
```

**Example Content:**
```json
{
  "name": "Name of this Proxy",
  "about": "Description of this proxy",
  "picture": "https://domain.com/image.jpg"
}
```

### Authorization

The client can authenticate to the proxy in one of two ways. It can send a cashu payment as described in [Client implementation](#client-implementation), or it can authenticate itself using [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md).

### Resolving Pubkeys

Both Client and Proxy can use kind `18909` announcements to resolve pubkeys to url's.

### Error handling

#### No more funds
When the client goes over the agreed upon (data) limits the proxy can decide to disconnect the websocket.
In this case the websocket connection is closed with code `1000`.
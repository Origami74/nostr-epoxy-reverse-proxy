NIP-AA
======

Relay proxying (epoxy)
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


NIP-BB
======

Payment required
-----------------------------------


### Payment

If the proxy implementation requires a payment or authentication it will respond to the `PROXY` request with one or both of the following options for authentication:

- `["PAYMENT_REQUIRED", "<challenge_string>" <payment_request>]`

`<challenge_string>` is a string that the client needs to add to a kind `22242` relay auth event and add to their `PROXY` request.

`<payment_request>` is a [NUT-18](https://github.com/cashubtc/nuts/blob/main/18.md) Payment request:

### Resolving Pubkeys

Both Client and Proxy use kind `18909` announcements to resolve pubkeys to url's.

### Error handling

#### No more funds
When the client goes over the agreed upon (data) limits the proxy can decide to disconnect the websocket.
In this case the websocket connection is closed with code `1000`.




## Motivation
A client may want to connect to a relay that is not directly accessible from the client's device or network. For example:

- A client is connected to a restricted network that only allows connections to the same geographical region, but wants to connect to a relay outside of that region.
- A client want to connect to a tor relay using a web-based nostr app, but cannot connect to the tor network in its web-browser.
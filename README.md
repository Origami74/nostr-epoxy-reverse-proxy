# NERP - Nostr Epoxy Reverse Proxy

Are operating a relay NERP yet? Use this **Nostr Epoxy Reverse Proxy** to allow clients to proxy through your relay and earn sats.

WIP NIP-XX proposal: [NIP-XX](NIP-XX.md)

## Why use this?

### For clients

- Enhanced privacy for the end-user, prevent IP address exposure to relays.
- Improved onion routing. If a Nostr onion is passed through a proxy, the person sending the onion cannot be identified.
- Super powerful when combined with requests encrypted using the public key of the final destination relay.

### For relay operators

- Stack sats
- Support user privacy

# How it works

- Relay operator sets DNS to route traffic to this reverse proxy
- Relay operator configures which relay this reverse proxy should forward to by default (their own relay instance)
- NERP by default forwards a websocket connection to the relay configured by the Relay operator.
- Customer can send ["PROXY", "wss://target.relay.com OR npubfTargetRelay"]
- NERP closes connection to default relay and reopens to the customer's target relay.

There is a short window in which the websocket between the customer and NERP is open, but the forwarded connection is not open yet. To resolve this, NERP buffers requests until tunnel is created and then replays these requests to the destination.

# Roadmap

- Support routing to npub of a relay
- Support payment negotiaton for relaying functionality
- Support other protocols like TOR and I2P

# Example usage

```javascript
const entryRelay = "ws://localhost:8000";
const proxyRelay = "wss://nos.lol";

const ws = new WebSocket(entryRelay);

ws.onopen = () => {
  ws.send(JSON.stringify(["PROXY", proxyRelay]));
};

ws.onmessage = (message) => {
  const parsed = JSON.parse(message.data);

  // Send request once we're connected to the proxy
  if (parsed[0] === "PROXY" && parsed[1] === "CONNECTED") {
    ws.send(
      JSON.stringify([
        "REQ",
        "sub-id1",
        {
          kinds: [1],
          authors: ["eaa24899024757f1457c3537ab08ffe255f97f0c520f1c7c3500e22b58b41b3a"],
        },
      ]),
    );
  }
  console.log(message.data);
};
```

NIP-XX
======

Relay proxying (epoxy)
-----------------------

`draft` `optional`

This nip describes a method by which relays can proxy a websocket to another relay based on either pubkey or url.

## Request definition
```json
["PROXY", "wss://relay.example.xyz"]

// or
["PROXY", "468ac7....001a4108"]
```

The arguments are the `PROXY` keyword first and second can be:
- A relay address
- A public key in hex format

WARNING:
If requests are not encrypted to a pubkey of the destination, the proxy server can send the traffic anywhere without the client being aware.


## Relay implementation
### Broadcast proxy

broadcast replacable event of kind `18909` event announcing the proxy capability to the network:

Tags:
tag `n` for network, one or more

tag `mint` for mints, one or more

tag `fee` for fee per mb,

tag `unit` for fee unit,


### Payments
cashu

## Client implementation
intro

### Resolving Pubkeys
NIP-66

### Error handling
todo
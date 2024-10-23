import { NostrEvent, NRelay1, NSecSigner } from "@nostrify/nostrify";

const relayPrivateKey = Deno.env.get("RELAY_PRIVATEKEY");
const publishRelay = Deno.env.get("PUBLISH_RELAY");

export const nostrNow = (): number => Math.floor(Date.now() / 1000);

export async function publishEvent(event: NostrEvent) {
  const signer = new NSecSigner(relayPrivateKey);
  const signedEvent = await signer.signEvent(event);

  new NRelay1(publishRelay).event(signedEvent);
}

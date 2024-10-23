import { WebSocket } from "ws";
import "jsr:@std/dotenv/load";
import { CashuMint, CashuWallet, Proof, getEncodedToken } from "@cashu/cashu-ts";
import { NSecSigner } from "@nostrify/nostrify";
import { publishEvent } from "./eventPublisher.ts";

const relayPrivateKey = Deno.env.get("RELAY_PRIVATEKEY");
const relayUrl = Deno.env.get("UPSTREAM");
const profitsPubkey = Deno.env.get("PROFITS_PUBKEY");
const profitsPayoutThreshold = Deno.env.get("PROFIT_PAYOUT_THRESHOLD");
const profitPubkeyLockEnabled = Deno.env.get("PROFITS_PUBKEY_LOCK") === "true";

const mintUrl = "mint.minibits.cash";
const mint = new CashuMint(mintUrl);
const wallet = new CashuWallet(mint);

type ProductListing = {
  name: "KiB" | "MiB" | "GiB";
  price: number;
  pubkey: string;
  mint: string;
};

type Payment = {
  proofs: Proof[];
  mint: string;
};

const products = [
  {
    name: "KiB",
    price: Deno.env.get("PRICE_KIB"),
    pubkey: "0287577dc0a3056b59f44b3c11d06d695a1806eae27a9ab4c73c03968df9293eb9",
    mint: "mint.minibits.cash",
  },
  {
    name: "MiB",
    price: Deno.env.get("PRICE_MIB"),
    pubkey: "0287577dc0a3056b59f44b3c11d06d695a1806eae27a9ab4c73c03968df9293eb9",
    mint: "mint.minibits.cash",
  },
];

console.log(`proxying to ${relayUrl}`);

const socketCleanup = new Map<WebSocket, () => void>();

function connectSockets(source: WebSocket, dest: WebSocket) {
  // Disconnect any existing connections before binding new one
  socketCleanup.get(source)?.();

  const forwardMessageToDest = (event: MessageEvent, isBinary) => {
    // Prevent proxy request from being forwarded to destination
    if (event.data.startsWith('["PROXY')) {
      return;
    }

    dest.send(event.data, { binary: isBinary });
  };

  const forwardMessageToSource = (event: MessageEvent, isBinary) => {
    source.send(event.data, { binary: isBinary });
  };

  const forwardErrorToSource = (err) => {
    console.log(`Connection error to ${dest.url}`, err);
    source.send(JSON.stringify(["PROXY", "ERROR", err.message]));
  };

  const forwardCloseToDest = () => {
    if (dest.readyState === WebSocket.OPEN) {
      dest.close();
    }
  };

  const forwardCloseToSource = () => {
    source.close();
  };

  // Assign forwards
  source.addEventListener("message", forwardMessageToDest);
  dest.addEventListener("message", forwardMessageToSource);

  source.addEventListener("close", forwardCloseToDest);
  dest.addEventListener("close", forwardCloseToSource);

  // TODO: If dest opens, but source is already closed, then close/cleanup dest.

  dest.addEventListener("error", forwardErrorToSource);

  // Save forwards for later cleanup
  socketCleanup.set(source, () => {
    source.removeEventListener("message", forwardMessageToDest);
    dest.removeEventListener("message", forwardMessageToSource);

    source.removeEventListener("close", forwardCloseToDest);
    dest.removeEventListener("close", forwardCloseToSource);

    dest.removeEventListener("error", forwardErrorToSource);

    dest.close();
  });
}

let nutSack: Proof[] = [];

async function putInWallet(tokens: Proof[], mintUrl: string) {
  const receivedAmount = tokens.reduce((total, proof) => total + proof.amount, 0);

  nutSack = nutSack.concat(tokens);

  const nutSackAmount = nutSack.reduce((total, proof) => total + proof.amount, 0);
  console.log(`Received ${receivedAmount} sats, nutsack now contains ${nutSackAmount} sats`);

  // Payout
  if (nutSackAmount >= profitsPayoutThreshold) {
    let redeemedTokens;
    if (profitPubkeyLockEnabled) {
      redeemedTokens = await wallet.receiveTokenEntry(
        { proofs: nutSack, mint: mintUrl },
        { privkey: relayPrivateKey, pubkey: `02${profitsPubkey}` },
      );
    } else {
      redeemedTokens = await wallet.receiveTokenEntry({ proofs: nutSack, mint: mintUrl }, { privkey: relayPrivateKey });
    }

    const encodedCashuToken = getEncodedToken({ token: [{ proofs: redeemedTokens, mint: mintUrl }] });
    const encryptedDmContent = await new NSecSigner(relayPrivateKey).nip04.encrypt(
      profitsPubkey,
      `Here's your profits from your relay proxying service. At ${new Date().toUTCString()}.\n ${encodedCashuToken}`,
    );

    let privateMessage = {
      created_at: Math.floor(Date.now() / 1000),
      kind: 4,
      tags: [["p", profitsPubkey]],
      content: encryptedDmContent,
    };

    try {
      await publishEvent(privateMessage);
      nutSack = [];
    } catch (e) {
      console.error("Failed to forward payment in dm", e);
    }
  }
}

async function validatePayment(payment: Payment): Promise<boolean> {
  if (!payment) {
    return false;
  }

  try {
    const redeemedTokens = await wallet.receiveTokenEntry(payment, { privkey: relayPrivateKey });
    await putInWallet(redeemedTokens, mintUrl);

    return true;
  } catch (e) {
    console.error("Payment failed: Error redeeming cashu tokens", e);
    return false;
  }
}

async function handleCustomerMessage(
  customerSocket: WebSocket,
  message: MessageEvent,
  useBuffer: boolean,
  buffer: MessageEvent[],
): Promise<void> {
  try {
    const data = JSON.parse(message.data);

    if (!Array.isArray(data)) throw new Error("Message is not an array");

    console.log(`message from consumer: ${message.data}`);

    if (useBuffer) {
      buffer.push(message);
      return;
    }

    const targetUrl = data[1];
    const payment: Payment | undefined = data[2];

    if (data[0] == "PROXY" && targetUrl) {
      const userPaid = await validatePayment(payment);

      if (!userPaid) {
        customerSocket.send(JSON.stringify(["PROXY", "PAYMENT_REQUIRED", products]));
        return;
      }

      const customerDestSocket = new WebSocket(targetUrl);
      customerSocket.send(JSON.stringify(["PROXY", "CONNECTING"]));

      connectSockets(customerSocket, customerDestSocket);

      customerDestSocket.addEventListener("open", () => {
        useBuffer = false;
        customerSocket.send(JSON.stringify(["PROXY", "CONNECTED"]));
      });
      return;
    }
  } catch (err) {
    console.log(`error processing message: ${err.message}`);
  }
}

Deno.serve("0.0.0.0", (req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket: customerSocket, response } = Deno.upgradeWebSocket(req);
  let useBuffer = true;
  let buffer: MessageEvent[] = [];

  customerSocket.addEventListener("open", () => {
    console.log("a customer connected");

    customerSocket.addEventListener("message", (message) => {
      handleCustomerMessage(customerSocket, message, useBuffer, buffer);
    });

    let defaultRelaySocket: WebSocket | undefined;
    defaultRelaySocket = new WebSocket(relayUrl);

    defaultRelaySocket.addEventListener("open", () => {
      console.log("connected to default relay!");

      connectSockets(customerSocket, defaultRelaySocket);

      // Send all buffered items to destination
      console.log("replaying buffer to defaultRelaySocket");
      useBuffer = false;
      buffer.forEach((bufferedMessage) => {
        handleCustomerMessage(customerSocket, bufferedMessage, useBuffer, buffer);
      });
      buffer = [];
    });
  });

  return response;
});

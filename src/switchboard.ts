
import { RawData, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../../logger.js';
import OutboundProxyWebSocket from '../network/outbound/websocket.js';

export default class Switchboard {
  private relay: NostrRelay;
  private log = logger.extend('Switchboard');

  constructor(relay: NostrRelay) {
    this.relay = relay;
  }

  public handleConnection(ws: WebSocket, req: IncomingMessage) {

    let target: WebSocket | undefined;

    const handleMessage = (message: RawData) => {
      try {
        // Parse JSON from the raw buffer
        const data = JSON.parse(typeof message === 'string' ? message : message.toString('utf-8'));

        if (!Array.isArray(data)) throw new Error('Message is not an array');


        const targetUrl = data[1];
        if(data[0] == 'PROXY' && targetUrl) {
          target = new OutboundProxyWebSocket(targetUrl)
          this.relay.disconnectSocket(ws);
          ws.send(JSON.stringify(["PROXY", "CONNECTING"]));

          target.on('open', () => {
            // Forward from client to target relay
            ws.on('message', (message, isBinary) => {
              target?.send(message, { binary: isBinary })
            })

            // Forward back from target relay to client
            target?.on('message', (message, isBinary) => {
              ws.send(message, { binary: isBinary })
            })

            // Step away from the connection
            ws.off('message', handleMessage)
            ws.send(JSON.stringify(["PROXY", "CONNECTED"]));
          })

          target.on('close', () => {
            ws.close();
          })

          target.on('error', (err) => {
            this.log(`Connection error to ${targetUrl}`, err)
            ws.send(JSON.stringify(["PROXY", "ERROR", err.message]));
          })

          ws.on('close', () => {
            target?.close();
          })
        }
      } catch (err) {
        this.log('Failed to handle message', err)
      }
    }
    ws.on('message', handleMessage)

    this.relay.handleConnection(ws, req)
  }
}
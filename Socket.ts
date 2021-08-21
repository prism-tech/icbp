import { EventEmitter } from 'events';
import WebSocket, { Data } from 'ws';

export interface Socket extends EventEmitter {
  on(event: 'package', listener: Socket.PackageListener): this;
}

export class Socket extends EventEmitter {

  private websocket: WebSocket;

  public constructor(websocket: WebSocket) {
    super();
    this.websocket = websocket;
    this.websocket.on('message', (data: Data): void => {
      if (typeof data === 'string') {
        const encoder: TextEncoder = new TextEncoder();
        const buffer: Buffer = Buffer.from(encoder.encode(data));
      } else if (data instanceof ArrayBuffer) {
        const buffer: Buffer = Buffer.from(data);
      } else if (data instanceof Array) {

      }
    });
  }

}

export namespace Socket {
  export type PackageListener = () => Promise<void> | void;
}

export default Socket;

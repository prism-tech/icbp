import { Socket as TCPSocket } from 'net';
import { IncomingMessage, Server as HttpServer, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import WebSocket, { Server as WebSocketServer } from 'ws';
import cookie, { CookieSerializeOptions } from 'cookie';
import { v4 } from 'uuid';

import { Socket } from './Socket';

export interface Server extends EventEmitter {
  on(event: 'connection', listener: Server.ConnectionListener): this;
}

export class Server extends EventEmitter {

  /**
   * @type HttpServer
   * @private
   */
  private readonly http: HttpServer = new HttpServer();

  /**
   * @type WebSocketServer
   * @private
   */
  private readonly ws: WebSocketServer = new WebSocketServer({ noServer: true });

  /**
   *
   */
  public constructor({
    cookie: {
      name: cookieName,
      secret: cookieSecretKey,
      ...cookieOptions
    },
    createContext = async (): Promise<void> => {},
  }: Server.ConstructorParameters) {
    super();

    this.http.on('request', async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      response.destroy();
    });

    this.http.on('upgrade', async (request: IncomingMessage, socket: TCPSocket, upgradeHead: Buffer): Promise<void> => {
      const cookies: Record<string, string> = cookie.parse(String(request.headers.cookie || ''));

      if (typeof cookies[cookieName] === 'string') {
        const chunks: string[] = cookies[cookieName].split(':');

        if (
          chunks.length === 2 &&
          chunks[1] === createHash('sha256')
            .update(chunks[0] + socket.remoteAddress + request.headers['user-agent'] + cookieSecretKey)
            .digest('hex')
        ) {
          const context: unknown = await createContext({
            uuid: chunks[0],
            remoteAddress: socket.remoteAddress,
            userAgent: request.headers['user-agent'],
          });

          this.ws.handleUpgrade(request, socket, upgradeHead, (websocket: WebSocket): void => {
            const socket: Socket = new Socket(websocket);
            this.emit('connection', socket, context);
          });

          return;
        }
      }

      const uuid: string = v4();
      const context: unknown = await createContext({
        uuid,
        remoteAddress: socket.remoteAddress,
        userAgent: request.headers['user-agent'],
      });

      this.ws.once('headers', (headers: string[]): void => {
        const signature: string = createHash('sha256')
          .update(uuid + socket.remoteAddress + request.headers['user-agent'] + cookieSecretKey)
          .digest('hex');

        headers.push('Set-Cookie: ' + cookie.serialize(cookieName, uuid + ':' + signature, cookieOptions));
      });

      this.ws.handleUpgrade(request, socket, upgradeHead, (websocket: WebSocket): void => {
        const socket: Socket = new Socket(websocket);
        this.emit('connection', socket, context);
      });
    });
  }

  /**
   *
   * @param {number} port
   * @param {string} hostname
   * @return {Promise}
   */
  public readonly listen: Server.ListenFunction = async (
    port: number = 3271,
    hostname: string = '0.0.0.0',
  ): Promise<void> => {
    return new Promise<void>((resolve, reject): void => {
      try {
        this.http.once('listening', resolve);
        this.http.once('error', reject);
        this.http.listen(port, hostname);
      } catch (error) {
        reject(error);
      }
    });
  };

  /**
   * @return {Promise}
   */
  public readonly close: Server.CloseFunction = async (): Promise<void> => {
    return new Promise<void>((resolve, reject): void => {
      try {
        this.http.once('close', resolve);
        this.http.once('error', reject);
        this.http.close();
      } catch (error) {
        reject(error);
      }
    });
  };

}

/**
 * @return {Server}
 */
export function createServer(parameters: Server.ConstructorParameters): Server {
  return new Server(parameters);
}

export namespace Server {
  export interface ConstructorParameters {
    cookie: Readonly<CookieParameters>;
    createContext?: CreateContextFunction;
  }

  export interface CookieParameters extends CookieSerializeOptions {
    name: string;
    secret: string;
  }

  export interface CreateContextParameters {
    uuid: string;
    remoteAddress: string;
    userAgent: string;
  }

  export type CreateContextFunction<Context = unknown> = (parameters: CreateContextParameters) => Promise<Context>;
  export type CloseFunction = () => Promise<void>;
  export type ListenFunction = (port?: number, hostname?: string) => Promise<void>;
  export type ConnectionListener = (socket: Socket, context: unknown) => Promise<void> | void;
}

export default Server;

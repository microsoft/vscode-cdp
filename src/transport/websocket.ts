/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { EventEmitter } from 'cockatiel';
import * as WebSocket from 'ws';
import { ICancellationToken, timeoutPromise } from '../cancellation';
import { ITransport, Transportable } from '.';

/**
 * Transport that works over a DOM or Node.js WebSocket.
 */
export class WebSocketTransport implements ITransport {
	private _ws: WebSocket | undefined;
	private readonly messageEmitter = new EventEmitter<Transportable>();
	private readonly endEmitter = new EventEmitter<Error | undefined>();

	public readonly onMessage = this.messageEmitter.addListener;
	public readonly onEnd = this.endEmitter.addListener;

	/**
	 * Creates a WebSocket transport by connecting to the given URL.
	 */
	static async create(
		url: string,
		options: WebSocket.ClientOptions,
		cancellationToken: ICancellationToken,
	): Promise<WebSocketTransport> {
		const ws = new WebSocket(url, [], {
			headers: { host: 'localhost' },
			maxPayload: 256 * 1024 * 1024,
			followRedirects: true,
			...options,
		});

		return timeoutPromise(
			new Promise<WebSocketTransport>((resolve, reject) => {
				ws.addEventListener('open', () => resolve(new WebSocketTransport(ws)));
				ws.addEventListener('error', errorEvent => reject(errorEvent.error)); // Parameter is an ErrorEvent. See https://github.com/websockets/ws/blob/master/doc/ws.md#websocketonerror
			}),
			cancellationToken,
			`Could not open ${url}`,
		).catch(err => {
			ws.close();
			throw err;
		});
	}

	constructor(ws: WebSocket) {
		this._ws = ws;
		this._ws.addEventListener('message', event => {
			this.messageEmitter.emit(event.data);
		});
		this._ws.addEventListener('close', () => {
			this.endEmitter.emit(undefined);
			this._ws = undefined;
		});
		this._ws.addEventListener('error', err => {
			this.endEmitter.emit(err.error);
			this._ws?.terminate();
			this._ws = undefined;
		});
	}

	/**
	 * @inheritdoc
	 */
	send(message: string) {
		this._ws?.send(message);
	}

	/**
	 * @inheritdoc
	 */
	dispose() {
		return new Promise<void>(resolve => {
			if (!this._ws) {
				return resolve();
			}

			this._ws.addEventListener('close', resolve);
			this._ws.close();
		});
	}
}

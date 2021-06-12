/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { EventEmitter, IDisposable } from 'cockatiel';
import { CdpProtocol } from './cdp-protocol';
import {
	ConnectionClosedError,
	DeserializationError,
	MessageProcessingError,
	ProtocolError,
	UnknownSessionError,
} from './errors';
import { ISerializer } from './serializer';
import { ITransport, Transportable } from './transport';

interface IProtocolCallback {
	resolve: (o: unknown) => void;
	reject: (e: Error) => void;
	stack?: string;
	method: string;
}

let shouldCaptureStackTrace = false;

/**
 * Turns on capturing of stack traces when CDP requests are issued.
 * This is useful for debugging, but has a performance overhead.
 */
export function captureCdpStackTraces(capture = true) {
	shouldCaptureStackTrace = capture;
}

export class Connection {
	private readonly sessions = new Map<string, CDPSession>();
	private lastId = 1000;
	private _closed = false;
	private readonly closeEmitter = new EventEmitter<Error | undefined>();
	private readonly willSendEmitter = new EventEmitter<CdpProtocol.ICommand>();
	private readonly didReceiveEmitter = new EventEmitter<CdpProtocol.Message>();
	private readonly receiveErrorEmitter = new EventEmitter<Error>();

	/**
	 * @returns true if the underlying transport is closed
	 */
	public get closed() {
		return this._closed;
	}

	/**
	 * Event that fires before anything is sent on the Connection.
	 */
	public readonly onWillSendMessage = this.willSendEmitter.addListener;

	/**
	 * Event that fires after a message is received on the connection.
	 */
	public readonly onDidReceiveMessage = this.willSendEmitter.addListener;

	/**
	 * Event that fires whenever an error is encountered processing received input.
	 */
	public readonly onDidReceiveError = this.receiveErrorEmitter.addListener;

	/**
	 * Event that fires when the transport is disconnected, or when the
	 * connection is manually disposed of. If it was the result of a transport
	 * error, the error is included.
	 */
	public readonly onDidClose = this.closeEmitter.addListener;

	/**
	 * Root CDP session.
	 */
	public readonly rootSession = new CDPSession(this, undefined);

	constructor(private readonly transport: ITransport, private readonly serializer: ISerializer) {
		transport.onMessage(message => this.onMessage(message));
		transport.onEnd(err => this.onTransportClose(err));
	}

	/**
	 * Primitive request message. You should usually use the `request` method on
	 * the {@link CDPSession} instance instead.
	 */
	public request(
		method: string,
		params: Record<string, unknown> | undefined = {},
		sessionId: string | undefined,
	): number {
		const id = ++this.lastId;
		this.send({ id, method, params, sessionId });
		return id;
	}

	/**
	 * Primitive request call. You should usually use the `request` method on
	 * the {@link CDPSession} instance instead.
	 */
	public send(message: CdpProtocol.Message) {
		this.transport.send(this.serializer.serialize(message));
	}

	/**
	 * Closes the connection and transport.
	 */
	public dispose() {
		this.onTransportClose(undefined);
	}

	/**
	 * Gets or creates a Session with the given ID. If no ID is passed, the
	 * root session is returned.
	 */
	public getSession(sessionId: string | undefined) {
		if (sessionId === undefined) {
			return this.rootSession;
		}

		const existing = this.sessions.get(sessionId);
		if (existing) {
			return existing;
		}

		const session = new CDPSession(this, sessionId);
		this.sessions.set(sessionId, session);
		session.onDidClose(() => this.sessions.delete(sessionId));
		return session;
	}

	private onTransportClose(error: Error | undefined) {
		if (this.closed) {
			return;
		}

		this._closed = true;
		this.transport.dispose();
		this.closeEmitter.emit(error);
		for (const session of this.sessions.values()) {
			session.dispose();
		}
	}

	private onMessage(message: Transportable) {
		let object: CdpProtocol.Message;
		try {
			object = this.serializer.deserialize(message);
		} catch (e) {
			this.receiveErrorEmitter.emit(new DeserializationError(e, message));
			return;
		}

		this.didReceiveEmitter.emit(object);

		const session = object.sessionId ? this.sessions.get(object.sessionId) : this.rootSession;
		if (!session) {
			this.receiveErrorEmitter.emit(new UnknownSessionError(object));
			return;
		}

		try {
			session.injectMessage(object);
		} catch (e) {
			this.receiveErrorEmitter.emit(new MessageProcessingError(e, object));
			return;
		}
	}
}

const enum ConnectionState {
	Open,
	Closed,
}

export class CDPSession implements IDisposable {
	private readonly callbacks = new Map<number, IProtocolCallback>();
	private readonly eventEmitter = new EventEmitter<CdpProtocol.ICommand>();
	private readonly closeEmitter = new EventEmitter<Error | undefined>();
	private readonly disposables: IDisposable[] = [];
	private connection:
		| { state: ConnectionState.Open; object: Connection }
		| { state: ConnectionState.Closed; cause: Error | undefined };
	private pauseQueue?: CdpProtocol.Message[];

	/**
	 * Emitter that fires whenever an event is received. Method replies
	 * are not emitted here.
	 */
	public readonly onDidReceiveEvent = this.eventEmitter.addListener;

	/**
	 * Event that fires when the transport is disconnected, or when the
	 * session is manually disposed of. If it was the result of a transport
	 * error, the error is included.
	 */
	public readonly onDidClose = this.closeEmitter.addListener;

	/**
	 * @returns true if the session or underlying connection is closed
	 */
	public get closed() {
		return this.connection.state === ConnectionState.Closed;
	}

	constructor(connection: Connection, public readonly sessionId: string | undefined) {
		this.connection = { state: ConnectionState.Open, object: connection };
		this.disposables.push(connection.onDidClose(cause => this.disposeInner(cause)));
	}

	/**
	 * Pauses the processing of messages for the connection.
	 */
	public pause() {
		this.pauseQueue ??= [];
	}

	/**
	 * Resumes the processing of messages for the connection.
	 */
	public resume() {
		if (!this.pauseQueue) {
			return;
		}

		const toSend = this.pauseQueue;
		this.pauseQueue = [];
		for (const item of toSend) {
			this.processResponse(item);
		}
	}

	/**
	 * Sends a request to CDP, returning its untyped result.
	 */
	public request(method: string, params: Record<string, unknown> = {}) {
		if (this.connection.state === ConnectionState.Closed) {
			return Promise.reject(new ConnectionClosedError(this.connection.cause));
		}

		const id = this.connection.object.request(method, params, this.sessionId);
		return new Promise<unknown>((resolve, reject) => {
			const obj: IProtocolCallback = { resolve, reject, method };

			if (shouldCaptureStackTrace) {
				Error.captureStackTrace(obj);
			}

			this.callbacks.set(id, obj);
		});
	}

	/**
	 * Sends a raw message on the session. For method calls, you should usually
	 * use `request` instead.
	 */
	public send(message: CdpProtocol.Message) {
		message.sessionId = this.sessionId;
		if (this.connection.state === ConnectionState.Open) {
			this.connection.object.send(message);
		}
	}

	/**
	 * Handles an incoming message. Called by the connection.
	 */
	public injectMessage(object: CdpProtocol.Message) {
		if (!this.pauseQueue || CdpProtocol.isResponse(object)) {
			this.processResponse(object);
		} else {
			this.pauseQueue.push(object);
		}
	}

	/**
	 * @inheritdoc
	 */
	public dispose() {
		this.disposeInner(undefined);
	}

	private disposeInner(cause: Error | undefined) {
		if (this.connection.state === ConnectionState.Closed) {
			return;
		}

		for (const callback of this.callbacks.values()) {
			callback.reject(new ConnectionClosedError(cause, callback.stack));
		}

		for (const disposable of this.disposables) {
			disposable.dispose();
		}

		this.callbacks.clear();
		this.connection = { state: ConnectionState.Closed, cause };
		this.pauseQueue = undefined;
		this.closeEmitter.emit(cause);
	}

	private processResponse(object: CdpProtocol.Message) {
		if (object.id === undefined) {
			// for some reason, TS doesn't narrow this even though CdpProtocol.ICommand
			// is the only type of the tuple where id can be undefined.
			this.eventEmitter.emit(object as CdpProtocol.ICommand);
			return;
		}

		const callback = this.callbacks.get(object.id);
		if (!callback) {
			return;
		}

		this.callbacks.delete(object.id);
		if ('error' in object) {
			callback.reject(
				ProtocolError.from(
					{
						code: object.error.code,
						message: object.error.message,
						method: callback.method,
					},
					callback.stack,
				),
			);
		} else if ('result' in object) {
			callback.resolve(object.result);
		} else {
			callback.reject(
				new Error(
					`Expected to have error or result in response: ${JSON.stringify(object)}`,
				),
			);
		}
	}
}

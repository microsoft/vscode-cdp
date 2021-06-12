/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { EventEmitter, IDisposable } from 'cockatiel';
import { CdpServerEventClient, CdpServerMethodHandlers, DomainMap } from './api';
import { CdpProtocol } from './cdp-protocol';
import { Connection } from './connection';
import { DeserializationError, ProtocolError, ProtocolErrorCode } from './errors';

/**
 * Allows implementing a server that handles method calls and can emit
 * events for the CDP domain.
 */
export class CdpServer<TDomains extends DomainMap> implements IDisposable {
	private handlerErrorEmitter = new EventEmitter<Error>();

	/**
	 * Emitter that fires if there's an uncaught error in a handler method.
	 */
	public readonly onDidThrowHandlerError = this.handlerErrorEmitter.addListener;

	constructor(private readonly connection: Connection) {
		connection.onDidReceiveError(err => {
			if (err instanceof DeserializationError) {
				connection.send({
					id: 0,
					error: { code: ProtocolErrorCode.ParseError, message: err.message },
				});
			}
		});
	}

	/**
	 * Dispose of the sessions and connection.
	 */
	public dispose() {
		this.connection.dispose();
	}

	/**
	 * Attaches a handler API for the given session on the connection.
	 */
	public apiForSession(api: CdpServerMethodHandlers<TDomains>, sessionId?: string): IDisposable {
		const session = this.connection.getSession(sessionId);

		const unknownMethod = (cmd: CdpProtocol.ICommand) =>
			session.send({
				id: cmd.id || 0,
				error: {
					code: ProtocolErrorCode.MethodNotFound,
					message: `Method ${cmd.method} not found`,
				},
			});

		const eventProxies = new Map(); // cache proxy creations
		const eventGetMethod = (t: { domain: string }, event: string) => (params: unknown) =>
			session.send({ method: `${t.domain}.${event}`, params });
		const eventClient = new Proxy(
			{},
			{
				get(_, domain: string) {
					let targetEvents = eventProxies.get(domain);
					if (!targetEvents) {
						targetEvents = new Proxy({ domain }, { get: eventGetMethod });
						eventProxies.set(domain, targetEvents);
					}

					return targetEvents;
				},
			},
		) as CdpServerEventClient<TDomains>;

		const listener = session.onDidReceiveEvent(cmd => {
			const [domain, fn] = cmd.method.split('.');
			if (!api.hasOwnProperty(domain)) {
				return unknownMethod(cmd);
			}

			const domainFns = api[domain];
			if (!domainFns.hasOwnProperty(fn)) {
				return unknownMethod(cmd);
			}

			const id = cmd.id || 0;
			domainFns[fn](eventClient, cmd.params)
				.then(result => session.send({ id, result }))
				.catch(e => {
					if (e instanceof ProtocolError) {
						session.send(e.serialize(id));
					} else {
						this.handlerErrorEmitter.emit(e);
						session.send({
							id,
							error: { code: ProtocolErrorCode.InternalError, message: e.message },
						});
					}
				});
		});

		return {
			dispose() {
				listener.dispose();
				session.dispose();
			},
		};
	}
}

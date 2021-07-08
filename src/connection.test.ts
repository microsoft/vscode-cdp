/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { CdpProtocol } from './cdp-protocol';
import { ClientConnection, Connection } from './connection';
import { ConnectionClosedError, DeserializationError, MessageProcessingError } from './errors';
import { JsonSerializer } from './serializer/json';
import { LoopbackTransport } from './transport/loopback';

describe('Connection', () => {
	const serializer = new JsonSerializer();
	let transport: LoopbackTransport;
	let conn: ClientConnection<{}>;

	beforeEach(() => {
		transport = new LoopbackTransport();
		conn = Connection.client(transport, serializer);
	});

	afterEach(() => {
		conn.dispose();
	});

	it('bubbles and updates the close state', () => {
		expect(conn.closed).toBe(false);
		const closed = jest.fn();
		const err = new Error('oh no!');

		conn.onDidClose(closed);
		transport.endWith(err);
		expect(closed).toHaveBeenCalledWith(err);
		expect(conn.closed).toBe(true);
	});

	it('bubbles and updates the close state to sessions', () => {
		const session = conn.getSession('sid');

		expect(session.closed).toBe(false);
		const closed = jest.fn();
		const err = new Error('oh no!');

		session.onDidClose(closed);
		transport.endWith(err);
		expect(closed).toHaveBeenCalledWith(err);
		expect(session.closed).toBe(true);
	});

	it('emits and routes events', () => {
		const s1 = conn.getSession('s1');
		const s2 = conn.getSession('s2');

		const e0 = jest.fn();
		conn.rootSession.onDidReceiveEvent(e0);
		const e1 = jest.fn();
		s1.onDidReceiveEvent(e1);
		const e2 = jest.fn();
		s2.onDidReceiveEvent(e2);

		const m0: CdpProtocol.ICommand = { method: 'm0', params: {} };
		transport.receive(serializer.serialize(m0));
		const m1: CdpProtocol.ICommand = { method: 'm1', params: {}, sessionId: 's1' };
		transport.receive(serializer.serialize(m1));
		const m2: CdpProtocol.ICommand = { method: 'm1', params: {}, sessionId: 's2' };
		transport.receive(serializer.serialize(m2));

		expect(e0).toHaveBeenCalledTimes(1);
		expect(e0).toHaveBeenCalledWith(m0);

		expect(e1).toHaveBeenCalledTimes(1);
		expect(e1).toHaveBeenCalledWith(m1);

		expect(e2).toHaveBeenCalledTimes(1);
		expect(e2).toHaveBeenCalledWith(m2);
	});

	it('rejects calls when connection is closed', async () => {
		const s1 = conn.getSession('s1');

		transport.onDidSend(() => {
			setImmediate(() => {
				transport.endWith();
			});
		});

		await expect(s1.request('World.greet', { hello: 'world' })).rejects.toBeInstanceOf(
			ConnectionClosedError,
		);
	});

	it('emits a serialization error', async () => {
		const err = new Promise(r => conn.onDidReceiveError(r));
		transport.receive('{');
		expect(await err).toBeInstanceOf(DeserializationError);
	});

	it('emits a error if it happened during message processing', async () => {
		const actualErr = new Promise(r => conn.onDidReceiveError(r));
		const s1 = conn.getSession('s1');
		s1.onDidReceiveEvent(() => {
			throw new Error('oh no!');
		});

		transport.receive(
			serializer.serialize({ method: 'Debugger.paused', sessionId: 's1', params: {} }),
		);

		expect(await actualErr).toBeInstanceOf(MessageProcessingError);
	});

	it('gets sessions idempotently', () => {
		const s1 = conn.getSession('s1');
		expect(s1).toBe(conn.getSession('s1'));
		expect(conn.getSession(undefined)).toBe(conn.rootSession);
	});

	it('cleans up sessions after dispose', () => {
		conn.getSession('s1');
		conn.dispose();
		expect((conn as any).sessions.size).toEqual(0);
	});
});

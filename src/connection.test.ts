/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { CdpProtocol } from './cdp-protocol';
import { captureCdpStackTraces, Connection } from './connection';
import {
	CdpError,
	ConnectionClosedError,
	InvalidParametersError,
	ProtocolError,
	ProtocolErrorCode,
} from './errors';
import { JsonSerializer } from './serializer/json';
import { LoopbackTransport } from './transport/loopback';

describe('Connection', () => {
	const serializer = new JsonSerializer();
	let transport: LoopbackTransport;
	let conn: Connection;

	beforeEach(() => {
		transport = new LoopbackTransport();
		conn = new Connection(transport, serializer);
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

	it('round trips successfully', async () => {
		const s1 = conn.getSession('s1');

		transport.onDidSend(msg => {
			setImmediate(() => {
				const r = serializer.deserialize(msg);
				expect((r as CdpProtocol.ICommand).params).toEqual({ hello: 'world' });
				transport.receive(
					serializer.serialize({
						id: r.id! - 1,
						result: { x: 'wrong id' },
						sessionId: 's1',
					}),
				);
				transport.receive(
					serializer.serialize({
						id: r.id!,
						result: { x: 'wrong session' },
						sessionId: 's2',
					}),
				);
				transport.receive(
					serializer.serialize({ id: r.id!, result: { x: 'hi' }, sessionId: 's1' }),
				);
			});
		});

		expect(await s1.request('World.greet', { hello: 'world' })).toEqual({ x: 'hi' });
	});

	async function captureError(error: CdpProtocol.IError['error']): Promise<ProtocolError> {
		const l = transport.onDidSend(msg => {
			setImmediate(() => {
				const r = serializer.deserialize(msg);
				transport.receive(serializer.serialize({ id: r.id!, error }));
				l.dispose();
			});
		});

		try {
			// wrap so we can test the stack contains doSend:
			await (async function doSend() {
				await conn.rootSession.request('World.greet', { hello: 'world' });
			})();
			throw new Error('expected to throw');
		} catch (e) {
			expect(e).toBeInstanceOf(CdpError);
			return e;
		}
	}

	it('captures error stacks', async () => {
		const err1 = await captureError({ code: 0, message: 'some error' });
		expect(err1.stack).not.toContain('doSend');

		captureCdpStackTraces(true);
		const err2 = await captureError({ code: 0, message: 'some error' });
		expect(err2.stack).toContain('doSend');
		captureCdpStackTraces(false);
	});

	it('emits typed errors', async () => {
		const err1 = await captureError({ code: 0, message: 'some error' });
		expect(err1.constructor).toBe(ProtocolError);
		const err2 = await captureError({
			code: ProtocolErrorCode.InvalidParams,
			message: 'some error',
		});
		expect(err2.constructor).toBe(InvalidParametersError);
	});

	it('errors if connection is closed', async () => {
		conn.dispose();
		const err1 = await captureError({ code: 0, message: 'some error' });
		expect(err1).toBeInstanceOf(ConnectionClosedError);
	});
});

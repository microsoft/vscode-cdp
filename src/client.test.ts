import { CdpProtocol } from './cdp-protocol';
import { captureCdpStackTraces } from './client';
import { ClientConnection, Connection } from './connection';
import {
	CdpError,
	ConnectionClosedError,
	InvalidParametersError,
	ProtocolError,
	ProtocolErrorCode,
} from './errors';
import { JsonSerializer } from './serializer/json';
import { LoopbackTransport } from './transport/loopback';

interface SampleDomains {
	Greeter: {
		requests: {
			hello: {
				params: { name: string; emit?: boolean; throw?: boolean };
				result: { greeting: string };
			};
		};
		events: {
			didHello: { params: string };
			didGoodbye: { params: string };
		};
	};
}

describe('Client', () => {
	const serializer = new JsonSerializer();
	let transport: LoopbackTransport;
	let conn: ClientConnection<SampleDomains>;

	beforeEach(() => {
		transport = new LoopbackTransport();
		conn = Connection.client(transport, serializer);
	});

	afterEach(() => {
		conn.dispose();
	});

	it('round trips successfully', async () => {
		const s1 = conn.getSession('s1');

		transport.onDidSend(msg => {
			setImmediate(() => {
				const r = serializer.deserialize(msg);
				expect((r as CdpProtocol.ICommand).method).toEqual('Greeter.hello');
				expect((r as CdpProtocol.ICommand).params).toEqual({ name: 'Connor' });
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
					serializer.serialize({
						id: r.id!,
						result: { greeting: 'hi' },
						sessionId: 's1',
					}),
				);
			});
		});

		const result = await s1.api.Greeter.hello({ name: 'Connor' });
		expect(result.greeting).toEqual('hi');
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

	it('pauses receiving events', async () => {
		const events: number[] = [];
		const s1 = conn.getSession('s1');
		s1.onDidReceiveEvent(evt => events.push(evt.params as number));

		transport.onDidSend(msg => {
			setImmediate(() => {
				const r = serializer.deserialize(msg);
				transport.receive(
					serializer.serialize({ id: r.id!, result: { x: 'hi' }, sessionId: 's1' }),
				);
			});
		});

		s1.pause();
		transport.receive(serializer.serialize({ method: '', sessionId: 's1', params: 1 }));
		transport.receive(serializer.serialize({ method: '', sessionId: 's1', params: 2 }));

		// can send/receive requests:
		expect(await s1.request('World.greet', { hello: 'world' })).toEqual({ x: 'hi' });
		// does not receive events when paused:
		expect(events).toHaveLength(0);

		s1.resume();

		// receives events when unpaused:
		expect(events).toEqual([1, 2]);
		transport.receive(serializer.serialize({ method: '', sessionId: 's1', params: 3 }));
		expect(events).toEqual([1, 2, 3]);

		s1.resume(); // is idempotent
		transport.receive(serializer.serialize({ method: '', sessionId: 's1', params: 4 }));
		expect(events).toEqual([1, 2, 3, 4]);
	});

	it('emits typed events', () => {
		const recv: string[] = [];
		const l1 = conn.rootSession.api.Greeter.onDidHello(d => recv.push(d));

		transport.receive(serializer.serialize({ method: 'Greeter.didHello', params: 'a' }));
		expect(recv).toEqual(['a']);

		conn.rootSession.api.Greeter.onDidHello(d => recv.push('other: ' + d));
		transport.receive(serializer.serialize({ method: 'Greeter.didHello', params: 'b' }));
		expect(recv).toEqual(['a', 'b', 'other: b']);

		l1.dispose();
		transport.receive(serializer.serialize({ method: 'Greeter.didHello', params: 'c' }));
		expect(recv).toEqual(['a', 'b', 'other: b', 'other: c']);
	});

	describe.skip('types', () => {
		it('types method params', () => {
			//@ts-expect-error
			conn.rootSession.api.Greeter.hello({ invalid: true });
		});

		it('types methods', () => {
			//@ts-expect-error
			conn.rootSession.api.Greeter.invalid({});
			//@ts-expect-error
			conn.rootSession.api.Potato.invalid({});
		});

		it('types method results', async () => {
			const r = await conn.rootSession.api.Greeter.hello({ name: 'Connor' });
			r.greeting;
			//@ts-expect-error
			r.other;
		});

		it('types event params', () => {
			conn.rootSession.api.Greeter.onDidHello(data => {
				data.split('');
				//@ts-expect-error
				data.unknown();
			});
		});
	});
});

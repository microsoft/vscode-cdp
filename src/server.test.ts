/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { CdpServerMethodHandlers } from './api';
import { CdpProtocol } from './cdp-protocol';
import { Connection, ServerConnection } from './connection';
import { ProtocolErrorCode } from './errors';
import { JsonSerializer } from './serializer/json';
import { Transportable } from './transport';
import { LoopbackTransport } from './transport/loopback';

interface SampleDomains {
	Greeter: {
		events: {
			didGreet: { params: string };
		};
		requests: {
			hello: {
				params: { name: string; emit?: boolean; throw?: boolean };
				result: { greeting: string };
			};
		};
	};
}

describe('Server', () => {
	const serializer = new JsonSerializer();
	let defaultApi: CdpServerMethodHandlers<SampleDomains>;
	let transport: LoopbackTransport;
	let server: ServerConnection<SampleDomains>;

	beforeEach(() => {
		defaultApi = {
			Greeter: {
				async hello(client, args) {
					if (args.throw) {
						throw new Error('oh no!');
					}

					if (args.emit) {
						client.Greeter.didGreet(args.name);
					}

					return { greeting: `Hello ${args.name}!` };
				},
			},
		};

		transport = new LoopbackTransport();
		server = Connection.server(transport, serializer);
	});

	afterEach(() => {
		server.dispose();
	});

	const roundTrip = async (req: CdpProtocol.ICommand) => {
		const r = new Promise<Transportable>(r => transport.onDidSend(r));
		transport.receive(serializer.serialize({ id: 1, ...req }));
		return serializer.deserialize(await r);
	};

	test('round trips happy method calls', async () => {
		server.rootSession.api = defaultApi;
		expect(
			await roundTrip({
				method: 'Greeter.hello',
				params: { name: 'Connor' },
				id: 1,
			}),
		).toEqual({
			id: 1,
			result: { greeting: 'Hello Connor!' },
		});
	});

	test('emits unknown if no attached api', async () => {
		expect(await roundTrip({ method: 'Greeter.hello', params: {}, id: 1 })).toEqual({
			id: 1,
			error: {
				code: ProtocolErrorCode.MethodNotFound,
				message: 'Method Greeter.hello not found',
			},
		});
	});

	test('emits unknown if bad domain', async () => {
		server.rootSession.api = defaultApi;
		expect(await roundTrip({ method: 'Potato.hello', params: {}, id: 1 })).toEqual({
			id: 1,
			error: {
				code: ProtocolErrorCode.MethodNotFound,
				message: 'Method Potato.hello not found',
			},
		});
	});

	test('emits unknown if bad method', async () => {
		server.rootSession.api = defaultApi;
		expect(await roundTrip({ method: 'Greeter.potato', params: {}, id: 1 })).toEqual({
			id: 1,
			error: {
				code: ProtocolErrorCode.MethodNotFound,
				message: 'Method Greeter.potato not found',
			},
		});
	});

	test('allows a custom unknown handler', async () => {
		server.rootSession.api = defaultApi;
		server.rootSession.api.unknown = async (_events, method, params) => ({
			unknownCall: { method, params },
		});
		expect(await roundTrip({ method: 'Some.unknown', params: { a: 42 }, id: 1 })).toEqual({
			id: 1,
			result: { unknownCall: { method: 'Some.unknown', params: { a: 42 } } },
		});
	});

	test('emits events', async () => {
		server.rootSession.api = defaultApi;
		const received: unknown[] = [];
		transport.onDidSend(r => received.push(serializer.deserialize(r)));
		transport.receive(
			serializer.serialize({
				id: 1,
				method: 'Greeter.hello',
				params: { name: 'Connor', emit: true },
			}),
		);

		await new Promise(r => setImmediate(r));

		expect(received).toEqual([
			{
				method: 'Greeter.didGreet',
				params: 'Connor',
			},
			{
				id: 1,
				result: { greeting: 'Hello Connor!' },
			},
		]);
	});

	test('catches errors', async () => {
		server.rootSession.api = defaultApi;
		expect(
			await roundTrip({
				method: 'Greeter.hello',
				params: { name: 'Connor', throw: true },
				id: 1,
			}),
		).toEqual({
			id: 1,
			error: { code: ProtocolErrorCode.InternalError, message: 'oh no!' },
		});
	});

	describe.skip('types', () => {
		test('types arguments correctly', () => {
			server.rootSession.api = {
				Greeter: {
					async hello(client, args) {
						//@ts-expect-error
						args.foo;
						return { greeting: 'hello' };
					},
				},
			};
		});

		test('types returns correctly', () => {
			server.rootSession.api = {
				Greeter: {
					//@ts-expect-error
					async hello() {
						return false;
					},
				},
			};
		});

		test('prevents invalid method', () => {
			server.rootSession.api = {
				Greeter: {
					async hello() {
						return { greeting: 'hello' };
					},
					//@ts-expect-error
					async potato() {
						return { greeting: 'hello' };
					},
				},
			};
		});

		test('prevents invalid domain', () => {
			server.rootSession.api = {
				Greeter: {
					async hello() {
						return { greeting: 'hello' };
					},
				},
				//@ts-expect-error
				Potato: {},
			};
		});

		test('demands all methods', () => {
			server.rootSession.api = {
				//@ts-expect-error
				Greeter: {},
			};
		});

		test('demands all domains', () => {
			//@ts-expect-error
			server.rootSession.api = {};
		});
	});
});

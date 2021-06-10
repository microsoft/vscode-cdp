/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import { CdpV8 } from './definitions';

interface Domain {
	requests: { [key: string]: RequestDef<any, any> };
	events: { [key: string]: EventDef<any> };
}

interface RequestDef<TParams, TResponse> {
	params: TParams;
	result: TResponse;
}

interface EventDef<TParams> {
	params: TParams;
}

type DomainsApiStyle1 = { [TKey in keyof CdpV8.Domains]: MapDomainStyle1<CdpV8.Domains[TKey]> };

interface IDisposable {
	dispose(): void;
}

type MapDomainStyle1<TDomain extends Domain> = {
	[TKey in keyof TDomain['requests']]: (
		arg: TDomain['requests'][TKey]['params'],
	) => Promise<TDomain['requests'][TKey]['result']>;
} & {
	on<TKey extends keyof TDomain['events']>(
		event: TKey,
		handler: (params: TDomain['events'][TKey]['params']) => void,
	): IDisposable;
};

const a: DomainsApiStyle1 = null!;
a.Debugger.restartFrame({ callFrameId: '0' });
a.Debugger.on('paused', params => {
	params.callFrames;
}).dispose();

type DomainsApiStyle2 = { [TKey in keyof CdpV8.Domains]: MapDomainStyle2<CdpV8.Domains[TKey]> };

interface Event<TParams> {
	(callback: (params: TParams) => void): IDisposable;
}

type MapDomainStyle2<TDomain extends Domain> = {
	[TKey in keyof TDomain['requests']]: (
		arg: TDomain['requests'][TKey]['params'],
	) => Promise<TDomain['requests'][TKey]['result']>;
} &
	{
		[TKey in keyof TDomain['events'] as `on${Capitalize<string & TKey>}`]: Event<
			TDomain['events'][TKey]['params']
		>;
	};

const b: DomainsApiStyle2 = null!;
b.Console.enable({ someClearMessage2Arg: 1 });
b.Debugger.onPaused(p => p.callFrames).dispose();

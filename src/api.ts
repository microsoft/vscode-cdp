/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { Event } from 'cockatiel';

export type DomainMap = { [name: string]: IDomain };

/**
 * Primitive definition of a CDP domain.
 */
export interface IDomain {
	requests: { [key: string]: IRequestDef<unknown, unknown> };
	events: { [key: string]: IEventDef<unknown> };
}

export interface IRequestDef<TParams, TResponse> {
	params: TParams;
	result: TResponse;
}

export interface IEventDef<TParams> {
	params: TParams;
}

type DomainEventHandlers<TDomain extends IDomain> = {
	[TKey in keyof TDomain['requests']]: Record<
		string,
		never
	> extends TDomain['requests'][TKey]['params']
		? () => Promise<TDomain['requests'][TKey]['result']>
		: (
				arg: TDomain['requests'][TKey]['params'],
		  ) => Promise<TDomain['requests'][TKey]['result']>;
} &
	{
		[TKey in keyof TDomain['events'] as `on${Capitalize<string & TKey>}`]: Event<
			TDomain['events'][TKey]['params']
		>;
	};

/**
 * A generic type that creates Event handler methods for a map of CDP domains.
 */
export type CdpClientHandlers<TDomains extends DomainMap> = {
	[TKey in keyof TDomains]: DomainEventHandlers<TDomains[TKey]>;
};

/**
 * A genmeric type that creates method handlers for a server
 * implementing the given CDP domain.
 */
export type CdpServerMethodHandlers<TDomains extends DomainMap> = {
	[TDomainName in keyof TDomains]: {
		[TKey in keyof TDomains[TDomainName]['requests']]: (
			client: CdpServerEventClient<TDomains>,
			arg: TDomains[TDomainName]['requests'][TKey]['params'],
		) => Promise<TDomains[TDomainName]['requests'][TKey]['result']>;
	};
};

/**
 * A genmeric type that creates event calls for server implementing
 * the given CDP domain.
 */
export type CdpServerEventClient<TDomains extends DomainMap> = {
	[TDomainName in keyof TDomains]: {
		[TKey in keyof TDomains[TDomainName]['events']]: (
			arg: TDomains[TDomainName]['events'][TKey]['params'],
		) => void;
	};
};

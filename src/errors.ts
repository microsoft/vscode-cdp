/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

/**
 * Updates the "cause" of the protocol error. This is used when dealing with
 * deferred errors in order to capture the stack at the call-site and fill
 * the error in with details after the response is received.
 * @hidden
 */
export function setProtocolErrorCause(error: ProtocolError, code: number, message: string) {
	error.cause = { code, message };
	error.message = `CDP error ${code} calling method ${error.method}: ${message}`;
	error.stack = error.stack?.replace('<<message>>', error.message);
	return error;
}

// @see https://source.chromium.org/chromium/chromium/src/+/master:v8/third_party/inspector_protocol/crdtp/dispatch.h;drc=3573d5e0faf3098600993625b3f07b83f8753867
export const enum ProtocolErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,
	ServerError = -32000,
}

/**
 * Base error extended by other error types.
 */
export class ProtocolError extends Error {
	public cause!: { code: number; message: string };

	constructor(public readonly method: string) {
		super('<<message>>');
	}
}

export class ProtocolParseError extends ProtocolError {}

export class InvalidRequestError extends ProtocolError {}

export class MethodNotFoundError extends ProtocolError {}

export class InvalidParametersError extends ProtocolError {}

export class InternalError extends ProtocolError {}

export class ServerError extends ProtocolError {}

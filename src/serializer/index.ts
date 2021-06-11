/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { Transportable } from '../transport';

export interface ISerializer {
	/**
	 * Serializes the message for the wire.
	 */
	serialize(message: unknown): Transportable;

	/**
	 * Deserializes a message from the wire.
	 */
	deserialize(message: Transportable): unknown;
}

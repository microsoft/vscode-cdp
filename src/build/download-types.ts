/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import { formatTs } from './format';
import { pdlUrlToJson } from './pdl2json';
import { pdlToTypeScript } from './pdlToTypeScript';

const sources = new Map([
	[
		'V8',
		'https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/js_protocol.pdl',
	],
	[
		'Browser',
		'https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/browser_protocol.pdl',
	],
	[
		'Node',
		'https://raw.githubusercontent.com/nodejs/node/master/src/inspector/node_protocol.pdl',
	],
]);

const target = path.resolve(__dirname, '../../src/definitions.ts');

async function main() {
	const definitions = await Promise.all(
		[...sources].map(async ([name, url]) => {
			const json = await pdlUrlToJson(url);
			return pdlToTypeScript(name, json);
		}),
	);

	const src = await formatTs(`/*---------------------------------------------------------
* Copyright (C) Microsoft Corporation. All rights reserved.
*--------------------------------------------------------*/

/* eslint-disable */

${definitions.join('\n\n')}`);

	await fs.writeFile(target, src);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

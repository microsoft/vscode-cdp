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
		'CdpV8',
		'https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/js_protocol.pdl',
	],
	[
		'CdpBrowser',
		'https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/browser_protocol.pdl',
	],
	[
		'CdpNode',
		'https://raw.githubusercontent.com/nodejs/node/master/src/inspector/node_protocol.pdl',
	],
]);

const target = path.resolve(__dirname, '../../src/definitions.ts');

async function main() {
	const definitions = pdlToTypeScript(
		await Promise.all(
			[...sources].map(async ([name, url]) => ({
				name,
				definition: await pdlUrlToJson(url),
			})),
		),
	);

	const src = await formatTs(`/*---------------------------------------------------------
* Copyright (C) Microsoft Corporation. All rights reserved.
*--------------------------------------------------------*/

/* eslint-disable */

${definitions}`);

	await fs.writeFile(target, src);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

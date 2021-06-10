/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import got from 'got';
import * as path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import * as PDL from './pdl-types';

const pdlPyUrl =
	'https://raw.githubusercontent.com/nodejs/node/306a57d33191d171bc148c0d06254730b6faa28e/tools/inspector_protocol/pdl.py';
const pdlPyPath = path.resolve(__dirname, '../../src/build/pdl.py');
const pdl2jsonPyPath = path.resolve(__dirname, '../../src/build/pdl2json.py');
const pipelineAsync = promisify(pipeline);

export async function pdlUrlToJson(pdlUrl: string) {
	const pdlContent = await got(pdlUrl);
	return pdlStringToJson(pdlContent.body);
}

export async function pdlStringToJson(str: string) {
	await downloadPdlPyIfMissing();

	return new Promise<PDL.Definition>((resolve, reject) => {
		const exe = spawn(process.env.PYTHON_PATH || 'python', [pdl2jsonPyPath]);
		const data: Buffer[] = [];
		exe.stdout.on('data', c => data.push(c));
		exe.stderr.pipe(process.stderr);
		exe.stdin.end(str);

		exe.on('error', reject);
		exe.on('exit', code => {
			const stdout = Buffer.concat(data).toString('utf-8');
			if (code === 0) {
				resolve(JSON.parse(stdout));
			} else {
				reject(new Error(`pdl2json.py exited with code ${code}: ${stdout}`));
			}
		});
	});
}

let downloadPdlPyIfMissingPromise: Promise<void> | undefined = undefined;

function downloadPdlPyIfMissing() {
	if (!downloadPdlPyIfMissingPromise) {
		downloadPdlPyIfMissingPromise = (async () => {
			try {
				await fs.stat(pdlPyPath);
				return;
			} catch {
				// continue to download
			}

			await pipelineAsync(got.stream(pdlPyUrl), createWriteStream(pdlPyPath));
		})();
	}
	return downloadPdlPyIfMissingPromise;
}

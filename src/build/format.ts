/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import * as prettier from 'prettier';

export const formatTs = async (src: string) => {
	const packageJson = await fs.readFile(path.resolve(__dirname, '../../package.json'));
	const config = JSON.parse(packageJson.toString('utf-8')).prettier;
	return prettier.format(src, {
		...config,
		parser: 'typescript',
	});
};

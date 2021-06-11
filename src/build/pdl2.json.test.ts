/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { pdlStringToJson } from './pdl2json';

describe('pdl2json', () => {
	it('is sane', async () => {
		const obj = await pdlStringToJson(`
version
  major 1
  minor 3

domain Foo
  type Bar extends object
    properties
      integer baz
`);
		expect(obj).toMatchSnapshot();
	});
});

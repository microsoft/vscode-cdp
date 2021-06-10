/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as PDL from './pdl-types';

const toTitleCase = (s: string) => s[0].toUpperCase() + s.substr(1);

export const pdlToTypeScript = (name: string, { domains }: PDL.Definition) => {
	const result = [];
	const interfaceSeparator = createSeparator();

	result.push(``);
	result.push(`export namespace Cdp${name} {`);
	result.push(`export type integer = number;`);
	interfaceSeparator();

	function appendText(text: string, tags: { [key: string]: string | boolean } = {}) {
		for (const key of Object.keys(tags)) {
			const value = tags[key];
			if (!value) {
				continue;
			}

			text += `\n@${key}`;
			if (typeof value === 'string') {
				text += ` ${value}`;
			}
		}

		if (!text) return;
		result.push('/**');
		for (const line of text.split('\n')) result.push(` * ${line}`);
		result.push(' */');
	}

	function createSeparator() {
		let first = true;
		return function () {
			if (!first) result.push('');
			first = false;
		};
	}

	function generateType(prop: PDL.DataType<boolean>): string {
		if (prop.type === 'string' && prop.enum) {
			return `${prop.enum.map(value => `'${value}'`).join(' | ')}`;
		}
		if ('$ref' in prop) {
			return prop.$ref;
		}
		if (prop.type === 'array') {
			const subtype = prop.items ? generateType(prop.items) : 'any';
			return `${subtype}[]`;
		}
		if (prop.type === 'object') {
			return 'any';
		}
		return prop.type;
	}

	function appendProps(props: Iterable<PDL.DataType<false>>) {
		const separator = createSeparator();
		for (const prop of props) {
			separator();
			appendText(prop.description ?? '', { deprecated: !!prop.deprecated });
			result.push(`${prop.name}${prop.optional ? '?' : ''}: ${generateType(prop)};`);
		}
	}

	function appendDomain(domain: PDL.Domain) {
		const apiSeparator = createSeparator();
		const commands = domain.commands || [];
		const events = domain.events || [];
		const types = domain.types || [];
		const name = toTitleCase(domain.domain);
		interfaceSeparator();
		appendText(`Methods and events of the '${name}' domain.`);
		result.push(`export interface ${name}Api {`);
		result.push(`requests: {`);
		for (const command of commands) {
			apiSeparator();
			appendText(command.description, { deprecated: !!command.deprecated });
			result.push(
				`${command.name}: { params: ${name}.${toTitleCase(
					command.name,
				)}Params, result: ${name}.${toTitleCase(command.name)}Result }`,
			);
		}
		result.push(`};`);

		result.push(`events: {`);
		for (const event of events) {
			apiSeparator();
			appendText(event.description, { deprecated: !!event.deprecated });
			result.push(`${event.name}: { params: ${name}.${toTitleCase(event.name)}Event };`);
		}

		result.push(`};`);
		result.push(`}`);

		const typesSeparator = createSeparator();
		interfaceSeparator();
		appendText(`Types of the '${name}' domain.`);
		result.push(`export namespace ${name} {`);
		for (const command of commands) {
			typesSeparator();
			appendText(`Parameters of the '${name}.${command.name}' method.`);
			result.push(`export interface ${toTitleCase(command.name)}Params {`);
			appendProps(command.parameters || []);
			result.push(`}`);
			typesSeparator();
			appendText(`Return value of the '${name}.${command.name}' method.`);
			result.push(`export interface ${toTitleCase(command.name)}Result {`);
			appendProps(command.returns || []);
			result.push(`}`);
		}
		for (const event of events) {
			typesSeparator();
			appendText(`Parameters of the '${name}.${event.name}' event.`);
			result.push(`export interface ${toTitleCase(event.name)}Event {`);
			appendProps(event.parameters || []);
			result.push(`}`);
		}
		for (const type of types) {
			typesSeparator();
			appendText(type.description ?? '', { deprecated: !!type.deprecated });
			if (type.type === 'object') {
				result.push(`export interface ${toTitleCase(type.id)} {`);
				if (type.properties) appendProps(type.properties);
				else result.push(`[key: string]: any;`);
				result.push(`}`);
			} else {
				result.push(`export type ${toTitleCase(type.id)} = ${generateType(type)};`);
			}
		}
		result.push(`}`);
	}

	interfaceSeparator();
	appendText('The list of domains.');
	result.push(`export interface Domains {
`);
	domains.forEach(d => {
		result.push(`${d.domain}: ${d.domain}Api;`);
	});
	result.push(`}`);

	domains.forEach(d => appendDomain(d));

	result.push(`}`);

	return result.join('\n');
};

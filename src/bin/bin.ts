#!/usr/bin/env node

import { Config, startServer } from '../server/server';

function getArgs(): Config {
	let clientId: string | null = null;
	let clientSecret: string | null = null;
	let redirectUri: string | null = null;
	let allowedEmails: string | null = null;
	let allowedIps: string | null = null;
	let port: string | null = null;
	let verbose: boolean = false;
	let redirect: boolean = false;

	for (let i = 1; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === '--client-id') {
			clientId = process.argv[++i];
		} else if (arg === '--client-secret') {
			clientSecret = process.argv[++i];
		} else if (arg === '--redirect-uri') {
			redirectUri = process.argv[++i];
		} else if (arg === '--allowed-emails') {
			allowedEmails = process.argv[++i];
		} else if (arg === '--allowed-ips') {
			allowedIps = process.argv[++i];
		} else if (arg === '--port') {
			port = process.argv[++i];
		} else if (arg === '--verbose') {
			verbose = true;
		} else if (arg === '--redirect') {
			redirect = true;
		}
	}

	if (!clientId || !clientSecret || !redirectUri || !allowedEmails || !port) {
		throw new Error(
			'You must provide the following arguments: --client-id, --client-secret, --redirect-uri, --allowed-emails, --port'
		);
	}

	return {
		clientId,
		clientSecret,
		redirectUri,
		allowedEmails: allowedEmails.split(','),
		allowedIps: allowedIps?.split(',') ?? [],
		port: parseInt(port),
		verbose,
		redirect,
	};
}

const args = getArgs();
startServer(args).then(() => {
	console.log(`Server started on port ${args.port}`);
});

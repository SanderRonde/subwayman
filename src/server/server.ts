/* eslint-disable @typescript-eslint/no-misused-promises */
import { google } from 'googleapis';
import * as express from 'express';
import * as https from 'https';
import * as url from 'url';
import { Address4, Address6 } from 'ip-address';

class IPKeeper {
	private _validIPs: Map<
		Address4 | Address6,
		{
			expiresAt: Date;
		}
	> = new Map();

	public constructor() {
		setInterval(() => {
			const now = new Date();
			for (const [token, { expiresAt }] of this._validIPs.entries()) {
				if (expiresAt < now) {
					this._validIPs.delete(token);
				}
			}
		}, 1000 * 60 * 60);
	}

	public static tryParseIp(ip: string): Address4 | Address6 | null {
		if (Address6.isValid(ip)) {
			return new Address6(ip);
		}
		if (Address4.isValid(ip)) {
			return new Address4(ip);
		}
		return null;
	}

	public addIP(ip: Address4 | Address6): void {
		this._validIPs.set(ip, {
			expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
		});
	}

	public addPermanentIP(ipString: string): void {
		const ip = IPKeeper.tryParseIp(ipString);
		if (!ip) {
			throw new Error(`Invalid IP: ${ipString}`);
		}
		this._validIPs.set(ip, {
			expiresAt: new Date(8640000000000000),
		});
	}

	public hasWhitelistedIP(ip: Address4 | Address6): boolean {
		for (const validIP of this._validIPs.keys()) {
			if (ip.isInSubnet(validIP)) {
				return true;
			}
		}
		return false;
	}
}

function initRoutes(config: Config, ipKeeper: IPKeeper): Promise<void> {
	const oauth2Client = new google.auth.OAuth2(
		config.clientId,
		config.clientSecret,
		config.redirectUri
	);

	const app = express();
	app.use(express.json());
	app.use(express.query({}));

	const pathname = new url.URL(config.redirectUri).pathname;
	app.post('/authorize', (req, res) => {
		const { ip: ipString, url } = req.body as {
			ip?: string;
			url?: string;
		};
		if (!ipString || !url) {
			res.status(400);
			res.end();
			return;
		}
		const ip = IPKeeper.tryParseIp(ipString);
		if (!ip) {
			res.status(400);
			res.end();
			return;
		}

		if (ipKeeper.hasWhitelistedIP(ip)) {
			// Authenticated, let them go through
			res.send(
				JSON.stringify({
					success: true,
				})
			);
			res.end();
			return;
		}

		if (config.verbose) {
			console.log(`Requesting authorization ${ip} - ${url}`);
		}

		// Redirect to OAuth page
		const redirectUrl = oauth2Client.generateAuthUrl({
			access_type: 'online',
			scope: ['email', 'profile'],
			state: JSON.stringify({ url, ip: ipString }),
		});

		res.send(
			JSON.stringify({
				success: false,
				redirectUrl,
			})
		);
		res.end();
	});
	app.get(pathname, async (req, res) => {
		// eslint-disable-next-line node/no-unsupported-features/es-builtins
		const { code, state } = req.query as {
			code?: string;
			state?: string;
		};
		if (!code || !state) {
			res.status(400);
			res.end();
			return;
		}

		// Exchange code for token
		const { tokens } = await oauth2Client.getToken(code);
		oauth2Client.setCredentials(tokens);

		// Exchange code for info
		const externalReq = https.request(
			{
				hostname: 'www.googleapis.com',
				path: '/oauth2/v3/userinfo',
				headers: {
					Authorization: `Bearer ${tokens.access_token}`,
				},
			},
			(externalRes) => {
				let data: string = '';
				externalRes.on('data', (chunk: string | Buffer) => {
					data += chunk.toString();
				});
				externalRes.on('end', () => {
					const parsedData = JSON.parse(data) as {
						sub: string;
						name: string;
						give_name: string;
						family_name: string;
						email: string;
						email_verified: boolean;
					};

					if (
						!parsedData.email_verified ||
						!config.allowedEmails.includes(parsedData.email)
					) {
						res.status(403);
						res.end();
						return;
					}

					const { url, ip: ipString } = JSON.parse(state) as {
						url: string;
						ip: string;
					};
					const ip = IPKeeper.tryParseIp(ipString);
					if (!ip) {
						console.log(`Invalid IP ${ipString}`);
						res.status(400);
						res.end();
						return;
					}

					ipKeeper.addIP(ip);

					if (config.verbose) {
						console.log(`Added to whitelisted IPs ${ip}`);
					}

					if (config.redirect) {
						res.redirect(url);
					} else {
						res.write(
							`<html><body style="font-size: 150%;">Click <a href="${url}">here</a> to go to the original URL</body></html>`
						);
						res.status(200);
						res.end();
					}
				});
			}
		);
		externalReq.end();
	});

	return new Promise((resolve) => {
		app.listen(config.port, resolve);
	});
}

export interface Config {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	allowedEmails: string[];
	allowedIps: string[];
	port: number;
	verbose: boolean;
	redirect: boolean;
}

export function startServer(config: Config): Promise<void> {
	const ipKeeper = new IPKeeper();
	for (const ip of config.allowedIps) {
		ipKeeper.addPermanentIP(ip);
	}
	return initRoutes(config, ipKeeper);
}

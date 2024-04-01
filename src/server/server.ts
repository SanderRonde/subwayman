/* eslint-disable @typescript-eslint/no-misused-promises */
import { google } from 'googleapis';
import * as express from 'express';
import * as url from 'url';
import * as https from 'https';

class IPKeeper {
	private _validIPs: Map<
		string,
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

	public addIP(ip: string): void {
		this._validIPs.set(ip, {
			expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
		});
	}

	public hasWhitelistedIP(ip: string): boolean {
		return this._validIPs.has(ip);
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
	app.post(pathname, (req, res) => {
		const { ip, url } = req.body as {
			ip?: string;
			url?: string;
		};
		if (!ip || !url) {
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

		// Redirect to OAuth page
		const redirectUrl = oauth2Client.generateAuthUrl({
			access_type: 'online',
			scope: ['email', 'profile'],
			state: url,
		});

		res.send(
			JSON.stringify({
				success: false,
				redirectUrl,
			})
		);
		res.end();
	});
	app.get('/authorize', async (req, res) => {
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

					const originalUrl = state;
					ipKeeper.addIP(req.headers['x-forwarded-for'] as string);
					res.write(
						`<html><body style="font-size: 150%;">Click <a href="${originalUrl}">here</a> to go to the original URL</body></html>`
					);
					res.status(200);
					res.end();
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
	port: number;
}

export function startServer(config: Config): Promise<void> {
	const ipKeeper = new IPKeeper();
	return initRoutes(config, ipKeeper);
}

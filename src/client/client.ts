import * as express from 'express';
import * as http from 'http';
import * as https from 'https';

function shouldRedirectRequestTo(
	request: { ip: string; url: string },
	config: {
		host: string;
		port: number;
	}
): Promise<string | undefined> {
	return new Promise<string | undefined>((resolve) => {
		// Authenticator!
		const httpLib =
			config.host.includes('localhost') ||
			config.host.includes('127.0.0.1')
				? http
				: https;
		const externalReq = httpLib.request(
			{
				hostname: config.host,
				path: '/authorize',
				port: config.port,
				headers: {
					'Content-Type': 'application/json',
				},
				method: 'POST',
			},
			(externalRes) => {
				if (externalRes.statusCode !== 200) {
					throw new Error(
						`Subwayman: Failed to check authentication status: ${externalRes.statusCode}`
					);
				}

				let data: string = '';
				externalRes.on('data', (chunk) => {
					data += chunk.toString();
				});
				externalRes.on('end', () => {
					const parsedData = JSON.parse(data) as
						| {
								success: true;
						  }
						| {
								success: false;
								redirectUrl: string;
						  };

					if (parsedData.success) {
						resolve(undefined);
					} else {
						resolve(parsedData.redirectUrl);
					}
				});
			}
		);
		externalReq.write(JSON.stringify(request));
		externalReq.end();
	});
}

export async function authenticatorRequestHandler(
	request: Request,
	config: {
		host: string;
		port: number;
	}
): Promise<Response | undefined> {
	const ip = request.headers.get('x-forwarded-for');
	if (!ip) {
		return new Response('No IP', { status: 400 });
	}
	const redirectTo = await shouldRedirectRequestTo(
		{
			ip: ip,
			url: request.url,
		},
		config
	);
	if (redirectTo) {
		return new Response(redirectTo, { status: 302 });
	}
	return undefined;
}

export function authenticatorMiddleware(config: {
	host: string;
	port: number;
}): express.RequestHandler {
	return async (
		req: express.Request,
		res: express.Response,
		next: express.NextFunction
	) => {
		const ip = req.headers['x-forwarded-for'];
		if (!ip) {
			return new Response('No IP', { status: 400 });
		}
		const redirectTo = await shouldRedirectRequestTo(
			{
				ip: Array.isArray(ip) ? ip[0] : ip,
				url: `https://${req.hostname}${req.originalUrl}`,
			},
			config
		);
		if (redirectTo) {
			return res.redirect(redirectTo);
		}
		return next();
	};
}

import * as express from 'express';
import * as http from 'http';
import * as https from 'https';

export function authenticator(config: {
	host: string;
	port: number;
}): express.RequestHandler {
	return (
		req: express.Request,
		res: express.Response,
		next: express.NextFunction
	) => {
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
						return next();
					} else {
						res.redirect(parsedData.redirectUrl);
					}
				});
			}
		);
		externalReq.write(
			JSON.stringify({
				ip: req.headers['x-forwarded-for'],
				originalUrl: `https://${req.hostname}${req.originalUrl}`,
			})
		);
		externalReq.end();
	};
}

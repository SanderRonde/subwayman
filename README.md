# Subwayman

Simple library for authenticating users using google's oauth2. The flow is as follows:

-   User visits your website
-   `subwayman` is installed as express middleware or as a request handler and triggers
-   IP is checked against a whitelist
-   If IP is not whitelisted yet, the user is redirected to the google oauth2 login page
-   If user logs in with a valid google account, the IP is added to the whitelist and the user can continue
-   Next time the user can instantly continue without logging in again

## Installation

```bash
yarn add subwayman && yarn global add subwayman
```

## Usage

Usage is designed for a reverse proxy context, where there is a single authentication server and multiple web servers that can connect to it. The authentication server needs to be exposed to the internet such that users are able to reach the oauth `redirect_uri`.

```javascript
// express-webserver.js
const express = require('express');
const {authenticatorMiddleware} = require('subwayman');

// Your app
const app = express();
app.use(authenticatorMiddleware({
	host: '127.0.0.1', // Host the subwayman server is running on
	port: 9999, // Port the subwayman server is running on
}))
// All of your other logic
app.use(...);
```

```javascript
// bun-webserver.js
const express = require('express');
const { authenticatorRequestHandler } = require('subwayman');

// Your app
Bun.serve({
	fetch: async (req) => {
		const response = await authenticatorRequestHandler(req, {
			host: '127.0.0.1', // Host the subwayman server is running on
			port: 9999, // Port the subwayman server is running on
		});
		if (response) {
			return response;
		}

		// All of your other logic
	},
});
```

```bash
# Start the subwayman server

# First generate some Google oauth credentials:
# https://developers.google.com/workspace/guides/create-credentials#oauth-client-id
subwayman --client-id oauth_client_id --client-secret oauth_client_secret --redirect-uri http://localhost:9999/auth --allowed-emails foo@example.com --port 9999
```

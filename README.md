# vscode-cdp

This package exports strongly-typed client and server implementations for the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/). These implementations are extensible with additional domains, and some handling of sessions and sockets is also included out of the box.

## Quickstart

Most likely, you're using this as a consumer of a CDP server (e.g. a browser or [js-debug](https://github.com/microsoft/vscode-js-debug/blob/main/CDP_SHARE.md)).

```ts
import { Connection, WebSocketTransport } from '@vscode/cdp';

// Acquire your connection to a browser, somehow, and then create a typed CDP wrapper.
const myWebSocket = await connectToBrowser();
const cdpClient = Connection.client(new WebSocketTransport(myWebSocket));

// You can then call methods in a strongly-typed way...
await cdpClient.rootSession.api.Debugger.enable();

// and also listen to them!
cdpClient.rootSession.api.Debugger.onPaused(evt => {
	console.log(evt.callFrames);
});
```

## Advanced Scenarios

### Custom Domains

By default, the `Connection.client` will by typed with the domains exposed by V8 and Chrome. However, this package also exports the undocumented Node.js-specific domains, and you can mix in custom domains. For example:

```ts
import { Connection, WebSocketTransport, CdpV8, CdpBrowser, CdpNode } from '@vscode/cdp';
// Uses "MyCustomDomains" from the Server Implementation section below:
type AllMyDomains = CdpV8.Domains & CdpBrowser.Domains & CdpNode.Domains & MyCustomDomains;
const cdpClient = Connection.client<AllMyDomains>(new WebSocketTransport(myWebSocket));
```

### Server Implementation

You can also implement a CDP server. Once again, this is all strongly-typed. You'll want to pass in a generic to `Connection.server` which is a map of domain names to `IDomain` interfaces, which define methods and events:

```ts
interface MyCustomDomains {
	Greeter: {
		events: {
			didGreet: { params: string };
		};
		requests: {
			hello: {
				params: { name: string; emit?: boolean; throw?: boolean };
				result: { greeting: string };
			};
		};
	};
}

webSocketServer.on('connection', ws => {
	const cdpServer = Connection.server<MyCustomDomains>(new WebSocketTransport(ws));

	cdpServer.rootSession.api = {
		Greeter: {
			async hello(client, args) {
				client.Greeter.didGreet(args.name);
				return { greeting: `Hello ${args.name}!` };
			},
		},
	};
});
```

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.

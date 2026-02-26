import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	type MiddlewareFunction,
} from "react-router";
import { getLocale, getTextDirection } from "./paraglide/runtime";
import { paraglideMiddleware } from "./paraglide/server.js";

export const middleware: MiddlewareFunction[] = [
	(ctx, next) => paraglideMiddleware(ctx.request, () => next()),
];

export default function App() {
	return <Outlet />;
}

export function Layout(props: { children: React.ReactNode }) {
	return (
		<html lang={getLocale()} dir={getTextDirection()}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				{props.children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

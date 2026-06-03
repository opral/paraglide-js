import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () =>
	createRouter({
		routeTree,
		context: {},
		scrollRestoration: true,
		trailingSlash: "never",
		defaultPreloadStaleTime: 0,
	});

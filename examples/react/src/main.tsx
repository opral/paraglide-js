import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { getLocale, getTextDirection } from "./paraglide/runtime.js";

document.documentElement.lang = getLocale();
document.documentElement.dir = getTextDirection();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>
);

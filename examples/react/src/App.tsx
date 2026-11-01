import { m } from "./paraglide/messages.js";
import { getLocale, locales, setLocale } from "./paraglide/runtime.js";

function App() {
	return (
		<main>
			<h1>{m.greeting({ name: "World" })}</h1>
			<nav aria-label="Language">
				{locales.map((locale) => (
					<button
						key={locale}
						type="button"
						aria-pressed={getLocale() === locale}
						onClick={() => setLocale(locale)}
					>
						{locale.toUpperCase()}
					</button>
				))}
			</nav>
			<p>
				{m.jojo_mountain_day({
					username: "John Doe",
					platform: "ios",
					userGender: "male",
				})}
			</p>
		</main>
	);
}

export default App;

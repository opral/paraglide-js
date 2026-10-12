import { getLocale, locales, setLocale } from "./paraglide/runtime.js";
import { loadLocale } from "./paraglide/locale-loader.js";
import { m } from "./paraglide/messages.js";
import "./style.css";

const app = document.querySelector("#app");
let bookCount = 2;

function render() {
	const locale = getLocale();
	document.documentElement.lang = locale;
	document.title = m.page_title();

	app.innerHTML = `
		<main class="card">
			<p class="eyebrow">${m.intro()}</p>
			<h1>${m.page_title()}</h1>
			<p class="greeting">${m.greeting({ name: "Alex" })}</p>
			<div class="preview">
				<button type="button" data-action="preview-german">Preview German greeting</button>
				<p class="preview-result" aria-live="polite">Click to load the German greeting.</p>
			</div>
			<p class="count" aria-live="polite">${m.task_count({ count: bookCount })}</p>
			<div class="actions">
				<button type="button" data-action="decrease">${m.decrease()}</button>
				<button type="button" data-action="increase">${m.increase()}</button>
			</div>
			<label class="locale-picker">
				<span>${m.language_label()}</span>
				<select aria-label="${m.language_label()}">
					${locales
						.map(
							(option) =>
								`<option value="${option}" ${option === locale ? "selected" : ""}>${option.toUpperCase()}</option>`
						)
						.join("")}
				</select>
			</label>
		</main>
	`;

	app.querySelector('[data-action="decrease"]').addEventListener("click", () => {
		bookCount = Math.max(0, bookCount - 1);
		render();
	});
	app.querySelector('[data-action="increase"]').addEventListener("click", () => {
		bookCount += 1;
		render();
	});
	app.querySelector('[data-action="preview-german"]').addEventListener("click", async () => {
		await loadLocale("de");
		app.querySelector(".preview-result").textContent = m.greeting({ name: "Alex" }, { locale: "de" });
	});
	app.querySelector("select").addEventListener("change", async (event) => {
		const nextLocale = event.currentTarget.value;
		await setLocale(nextLocale, { reload: false });
		render();
	});
}

render();

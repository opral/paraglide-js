import * as m from "../src/paraglide/messages.js";
import { getLocale, setLocale } from "../src/paraglide/runtime.js";
import { loadLocale } from "../src/paraglide/locale-loader.js";

const state = document.querySelector("#state");
const render = () => {
  state.textContent = `${getLocale()}|${m.greeting()}|${m.signIn()}`;
  document.documentElement.lang = getLocale();
};
render();

window.probeLocaleSplit = {
  async switchTo(locale) {
    await setLocale(locale, { reload: false });
    render();
    return { text: state.textContent, locale: getLocale(), stored: localStorage.getItem("locale") };
  },
  async explicit(locale) {
    await loadLocale(locale);
    return m.greeting({}, { locale });
  },
  async preload(locale) {
    await loadLocale(locale);
    return true;
  },
  activeLocale() {
    return getLocale();
  },
};

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test, expect } from "../fixtures/frigate-test";
import { PLACEHOLDER_PNG } from "../helpers/api-mocker";

test("capture French Live locale namespace requests", async ({ frigateApp }, testInfo) => {
  await frigateApp.page.addInitScript(() => {
    localStorage.setItem("frigate-ui-language", "fr");
    (window as any).__probeNavigationStartedAt = performance.now();
    (window as any).__frenchControlReadyAt = null;
    (window as any).__frenchControlTimeline = {
      domAt: null,
      translatedTextAt: null,
      accessibleVisibleAt: null,
      visibleTextAt: null,
    };
    (window as any).__actionsBeforeFrenchControlReady = [];

    for (const eventName of [
      "click",
      "pointerdown",
      "pointerover",
      "mouseover",
      "touchstart",
      "keydown",
    ]) {
      document.addEventListener(
        eventName,
        (event) => {
          (window as any).__actionsBeforeFrenchControlReady.push({
            type: event.type,
            at: performance.now(),
            trusted: event.isTrusted,
          });
        },
        true,
      );
    }

    const isVisible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const noteFrenchControls = () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const back = buttons.find(
        (button) =>
          button.getAttribute("aria-label") === "Retour" &&
          isVisible(button),
      );
      const history = buttons.find(
        (button) =>
          button.getAttribute("aria-label") ===
          "Afficher les vidéos archivées",
      );

      if (back && history) {
        const timeline = (window as any).__frenchControlTimeline;
        timeline.domAt ??= performance.now();
        if (
          back.innerText.trim() === "Retour" &&
          history.innerText.trim() === "Historique"
        ) {
          timeline.translatedTextAt ??= performance.now();
        }
        if (isVisible(back) && isVisible(history)) {
          timeline.accessibleVisibleAt ??= performance.now();
          (window as any).__frenchControlReadyAt ??=
            timeline.accessibleVisibleAt;
          if (
            back.innerText.trim() === "Retour" &&
            history.innerText.trim() === "Historique"
          ) {
            timeline.visibleTextAt ??= performance.now();
          }
        }
        (window as any).__frenchControlReady = {
          backText: back.innerText.trim(),
          backLabel: back.getAttribute("aria-label"),
          historyText: history.innerText.trim(),
          historyLabel: history.getAttribute("aria-label"),
        };
      }
    };
    new MutationObserver(noteFrenchControls).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-label"],
    });
    document.fonts.addEventListener("loadingdone", noteFrenchControls);
  });
  await frigateApp.page.route("**/api/*/latest.webp**", (route) =>
    route.fulfill({ contentType: "image/png", body: PLACEHOLDER_PNG }),
  );

  const localeResponses: { locale: string; namespace: string; status: number }[] = [];
  const assetResponses: { path: string; status: number; type: string; length: string | null }[] = [];
  const assetHeaderTasks: Promise<void>[] = [];
  frigateApp.page.on("response", (response) => {
    const url = new URL(response.url());
    const match = url.pathname.match(/^\/locales\/([^/]+)\/(.+)\.json$/);
    if (match) {
      localeResponses.push({
        locale: match[1],
        namespace: match[2],
        status: response.status(),
      });
    }
    if (url.pathname.startsWith("/assets/") && /\.(?:js|css)$/.test(url.pathname)) {
      assetHeaderTasks.push(response.allHeaders().then((headers) => {
        assetResponses.push({
          path: url.pathname,
          status: response.status(),
          type: headers["content-type"] ?? "",
          length: headers["content-length"] ?? null,
        });
      }));
    }
  });

  await frigateApp.goto("/#front_door");
  await expect(frigateApp.page).toHaveTitle("Front Door - Direct - Frigate");
  await expect
    .poll(() => frigateApp.page.locator("html").getAttribute("lang"))
    .toBe("fr");
  await expect
    .poll(() =>
      frigateApp.page.evaluate(
        () => (window as any).__frenchControlReadyAt ?? null,
      ),
    )
    .not.toBeNull();
  const timing = await frigateApp.page.evaluate(async () => {
    await document.fonts.ready;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const locale = performance.getEntriesByType("resource")
      .filter((entry) => /\/locales\/(?:fr|en)\/.+\.json/.test(entry.name))
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          url: new URL(resource.name).pathname,
          startTime: resource.startTime,
          responseEnd: resource.responseEnd,
          duration: resource.duration,
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
          protocol: resource.nextHopProtocol,
        };
      });
    return {
      navigation: {
        protocol: nav.nextHopProtocol,
        requestStart: nav.requestStart,
        responseStart: nav.responseStart,
        domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
        loadEventEnd: nav.loadEventEnd,
      },
      fontsReadyAt: performance.now(),
      fontChecks: {
        regular: document.fonts.check("400 14px Inter"),
        medium: document.fonts.check("500 14px Inter"),
      },
      frenchControlReadyAt: (window as any).__frenchControlReadyAt,
      frenchControl: (window as any).__frenchControlReady,
      frenchControlTimeline: (window as any).__frenchControlTimeline,
      actionsBeforeFrenchControlReady: (window as any)
        .__actionsBeforeFrenchControlReady,
      fontResources: performance.getEntriesByType("resource")
        .filter((entry) => /\.(?:woff2?|ttf|otf)(?:\?|$)/.test(entry.name))
        .map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          return {
            url: new URL(resource.name).pathname,
            startTime: resource.startTime,
            responseEnd: resource.responseEnd,
            duration: resource.duration,
            encodedBodySize: resource.encodedBodySize,
            protocol: resource.nextHopProtocol,
          };
        }),
      apiResources: performance.getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname.startsWith("/api/"))
        .map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          return {
            url: new URL(resource.name).pathname,
            startTime: resource.startTime,
            responseEnd: resource.responseEnd,
            duration: resource.duration,
            protocol: resource.nextHopProtocol,
          };
        }),
      jsResources: performance.getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
        .map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          return {
            url: new URL(resource.name).pathname,
            startTime: resource.startTime,
            responseEnd: resource.responseEnd,
            duration: resource.duration,
          };
        })
        .sort((a, b) => a.responseEnd - b.responseEnd),
      locale,
      bodyText: document.body.innerText,
    };
  });
  await Promise.all(assetHeaderTasks);

  const unique = [...new Map(
    localeResponses.map((response) => [
      `${response.locale}/${response.namespace}`,
      response,
    ]),
  ).values()].sort((a, b) =>
    `${a.locale}/${a.namespace}`.localeCompare(`${b.locale}/${b.namespace}`),
  );

  const outputRoot = process.env.NAMESPACE_GRAPH_OUTPUT;
  if (!outputRoot) throw new Error("Set NAMESPACE_GRAPH_OUTPUT to the result prefix.");
  const outputPath = `${outputRoot}.${testInfo.project.name}.json`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({
      project: testInfo.project.name,
      path: "/#front_door",
      documentLanguage: "fr",
      title: await frigateApp.page.title(),
      requests: unique,
      timing,
      assets: [...new Map(assetResponses.map((asset) => [asset.path, asset])).values()].sort((a, b) => a.path.localeCompare(b.path)),
    }, null, 2)}\n`,
  );
  console.log(`FRIGATE_NAMESPACE_GRAPH ${testInfo.project.name} ${JSON.stringify(unique)}`);
  console.log(`FRIGATE_ROUTE_TIMING ${testInfo.project.name} ${JSON.stringify(timing)}`);
});

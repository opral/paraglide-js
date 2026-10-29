import fs from "node:fs/promises";
const median = (values) =>
	values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const number = (value) => value.toFixed(1);
for (const [file, counts] of [
	["plain", [6400, 20000]],
	["mixed", [6400]],
]) {
	const { results } = JSON.parse(
		await fs.readFile(
			new URL(`./results/${file}.json`, import.meta.url),
			"utf8"
		)
	);
	for (const count of counts) {
		console.log(`\n### ${count.toLocaleString("en-US")} messages, ${file}\n`);
		console.log(
			"| Variant | Disk files | Dev modules | Generate + prepare + write ms | Dev graph crawl ms | Edit compile + prepare + write ms | 10% usage gzip bytes |"
		);
		console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
		for (const variant of [...new Set(results.map((row) => row.variant))]) {
			const rows = results.filter(
				(row) => row.count === count && row.variant === variant
			);
			console.log(
				`| ${variant} | ${rows[0].disk.total} | ${rows[0].dev.modules} | ${number(median(rows.map((row) => row.generateMs + row.prepareMs + row.writeMs)))} | ${number(median(rows.map((row) => row.devGraphMs)))} | ${number(median(rows.map((row) => row.edit.compileMs + row.edit.prepareMs + row.edit.writeAndInvalidateMs)))} | ${median(rows.map((row) => row.bundleManyGzipBytes))} |`
			);
		}
	}
}

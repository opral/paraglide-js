import { expect, test } from "vitest";
import { getInputVariables } from "./input-variables.js";

test("infers inputs from local declaration references and dynamic units", () => {
	const inputs = getInputVariables([
		{
			type: "local-variable",
			name: "formattedDuration",
			value: {
				type: "expression",
				arg: { type: "variable-reference", name: "duration" },
				annotation: {
					type: "function-reference",
					name: "relativetime",
					options: [
						{
							name: "unit",
							value: { type: "literal", value: "$unit" },
						},
					],
				},
			},
		},
	]);

	expect(inputs.map((input) => input.name)).toEqual(["duration", "unit"]);
});

test("infers inputs referenced by pattern formatter options", () => {
	const inputs = getInputVariables(
		[],
		[
			[
				{
					type: "expression",
					arg: { type: "variable-reference", name: "count" },
					annotation: {
						type: "function-reference",
						name: "number",
						options: [
							{
								name: "minimumFractionDigits",
								value: { type: "variable-reference", name: "digits" },
							},
						],
					},
				},
			],
		]
	);

	expect(inputs.map((input) => input.name)).toEqual(["count", "digits"]);
});

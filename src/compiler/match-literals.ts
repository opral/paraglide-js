const UNSUPPORTED_NUMERIC_MATCH_PREFIX = /^(0[bBoOxX]|[+-]?Infinity$|NaN$)/;

export function renderInputMatchCondition(
	inputExpression: string,
	literalValue: string
): string {
	const numericLiteral = parseNumericMatchLiteral(literalValue);

	if (numericLiteral === undefined) {
		return `${inputExpression} === ${JSON.stringify(literalValue)}`;
	}

	return `(${inputExpression} === ${numericLiteral} || ${inputExpression} === ${JSON.stringify(
		literalValue
	)})`;
}

export function renderInputMatchTypeVariants(literalValue: string): string[] {
	const numericLiteral = parseNumericMatchLiteral(literalValue);
	const variants = new Set<string>();

	if (numericLiteral !== undefined) {
		variants.add(numericLiteral);
	}

	variants.add(JSON.stringify(literalValue));

	return Array.from(variants);
}

function parseNumericMatchLiteral(literalValue: string): string | undefined {
	if (
		literalValue.length === 0 ||
		literalValue.trim() !== literalValue ||
		UNSUPPORTED_NUMERIC_MATCH_PREFIX.test(literalValue)
	) {
		return undefined;
	}

	const parsed = Number(literalValue);

	if (!Number.isFinite(parsed)) {
		return undefined;
	}

	if (Number.isInteger(parsed) && !Number.isSafeInteger(parsed)) {
		return undefined;
	}

	return String(parsed);
}

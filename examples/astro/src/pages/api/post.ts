export async function POST({ request }: { request: Request }) {
	const formData = await request.formData();
	const message = String(formData.get("message") ?? "");
	return new Response(JSON.stringify({ message }), {
		headers: { "content-type": "application/json" },
	});
}

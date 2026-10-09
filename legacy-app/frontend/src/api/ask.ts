import { ApiError, withoutNulls } from "./client.js";
import type { SearchResponse } from "./types.js";

export type AskEvent =
	| { readonly type: "sources"; readonly data: SearchResponse }
	| { readonly type: "token"; readonly text: string }
	| { readonly type: "abstain"; readonly reason: string }
	| { readonly type: "error"; readonly reason: string }
	| { readonly type: "done" };

export async function* ask(query: string, signal: AbortSignal): AsyncGenerator<AskEvent> {
	const response = await fetch("/api/ask", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query }),
		signal,
	});
	if (!response.ok || !response.body) {
		const detail = await response.json().catch(() => undefined);
		throw new ApiError(response.status, detail?.detail ?? `Erreur ${response.status}`);
	}

	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) return;
		buffer += value;
		let boundary = buffer.indexOf("\n\n");
		while (boundary !== -1) {
			const event = parseEvent(buffer.slice(0, boundary));
			buffer = buffer.slice(boundary + 2);
			if (event) yield event;
			boundary = buffer.indexOf("\n\n");
		}
	}
}

function parseEvent(raw: string): AskEvent | undefined {
	const name = raw.match(/^event: (.+)$/m)?.[1];
	const payload = raw.match(/^data: (.+)$/m)?.[1];
	if (!name || payload === undefined) return undefined;
	const data = withoutNulls(JSON.parse(payload)) as Record<string, unknown>;
	switch (name) {
		case "sources":
			return { type: "sources", data: data as unknown as SearchResponse };
		case "token":
			return { type: "token", text: String(data.text) };
		case "abstain":
			return { type: "abstain", reason: String(data.reason) };
		case "error":
			return { type: "error", reason: String(data.reason) };
		case "done":
			return { type: "done" };
		default:
			return undefined;
	}
}

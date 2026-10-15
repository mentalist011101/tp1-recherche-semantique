import type {
	ArithmeticResponse,
	ArithmeticTerm,
	Article,
	ChatEvent,
	SearchFilters,
	SearchResponse,
	Stats,
} from "./types.js";

export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export const api = {
	stats: () => get<Stats>("/api/stats"),
	articles: () => get<readonly Article[]>("/api/articles"),
	search: (query: string, filters: SearchFilters, k = 5) => {
		const params = new URLSearchParams({ q: query, k: String(k) });
		if (filters.langue) params.set("langue", filters.langue);
		if (filters.modalite) params.set("modalite", filters.modalite);
		return get<SearchResponse>(`/api/search?${params}`);
	},
	arithmetic: (terms: readonly ArithmeticTerm[]) => post<ArithmeticResponse>("/api/arithmetic", { terms }),
};

// La réponse arrive en NDJSON : une ligne JSON par événement (sources, morceau de texte, fin).
export async function* chat(question: string, signal: AbortSignal): AsyncGenerator<ChatEvent> {
	const response = await fetch("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ question }),
		signal,
	});
	if (!response.ok || !response.body) {
		throw new ApiError(response.status, await errorMessage(response));
	}
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += value;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (line.trim()) yield withoutNulls(JSON.parse(line)) as ChatEvent;
		}
	}
}

async function get<T>(path: string): Promise<T> {
	return parse<T>(await fetch(path));
}

async function post<T>(path: string, body: unknown): Promise<T> {
	return parse<T>(
		await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
	);
}

async function parse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		throw new ApiError(response.status, await errorMessage(response));
	}
	return withoutNulls(await response.json()) as T;
}

async function errorMessage(response: Response): Promise<string> {
	try {
		const body = await response.json();
		if (typeof body.detail === "string") return body.detail;
		if (Array.isArray(body.detail)) return body.detail[0]?.msg ?? response.statusText;
	} catch {
		// Corps non JSON (proxy, page d'erreur HTML) : on retombe sur le statut HTTP.
	}
	return `Erreur ${response.status}`;
}

// L'API Python sérialise None en null ; le front ne manipule que undefined.
function withoutNulls(value: unknown): unknown {
	if (value === null) return undefined;
	if (Array.isArray(value)) return value.map(withoutNulls);
	if (typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, withoutNulls(v)]),
		);
	}
	return value;
}

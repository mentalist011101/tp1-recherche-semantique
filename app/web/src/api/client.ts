import type { Article, SearchFilters, SearchResponse, Stats } from "./types.js";

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
};

async function get<T>(path: string): Promise<T> {
	const response = await fetch(path);
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

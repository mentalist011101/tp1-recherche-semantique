import type {
	CompareResponse,
	Diagnostics,
	EvaluationReport,
	Game,
	Guess,
	JudgeReport,
	Method,
	Modality,
	Passage,
	Projection,
	Quiz,
	Reveal,
	SearchResponse,
	SemanticMap,
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
	search: (query: string, method: Method, k = 8) =>
		post<SearchResponse>("/api/search", { query, method, k }),
	compare: (query: string) => post<CompareResponse>("/api/compare", { query, k: 5 }),
	diagnose: (query: string) => post<Diagnostics>("/api/diagnose", { query }),
	judge: (query: string, passageIds: readonly string[]) =>
		post<JudgeReport>("/api/judge", { query, passage_ids: passageIds }),
	passage: (id: string) => get<Passage>(`/api/passages/${encodeURIComponent(id)}`),
	map: () => get<SemanticMap>("/api/map"),
	project: (query: string) => post<Projection>("/api/map/project", { query }),
	evaluation: () => get<EvaluationReport>("/api/evaluation"),
	quiz: (modality: Modality | undefined) => post<Quiz>("/api/quiz", { modality }),
	dailyGame: () => get<Game>("/api/cemantix/daily"),
	newGame: (exclude: number) => post<Game>(`/api/cemantix/new?exclude=${exclude}`, {}),
	guess: (game: number, word: string) => post<Guess>("/api/cemantix/guess", { game, word }),
	hint: (game: number, bestRank: number | undefined) =>
		post<{ readonly word: string; readonly rank: number }>("/api/cemantix/hint", {
			game,
			best_rank: bestRank,
		}),
	reveal: (game: number) => post<Reveal>("/api/cemantix/reveal", { game }),
};

async function get<T>(path: string): Promise<T> {
	return parse<T>(await fetch(path));
}

async function post<T>(path: string, body: unknown): Promise<T> {
	return parse<T>(
		await fetch(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
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
export function withoutNulls(value: unknown): unknown {
	if (value === null) return undefined;
	if (Array.isArray(value)) return value.map(withoutNulls);
	if (typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, withoutNulls(v)]),
		);
	}
	return value;
}

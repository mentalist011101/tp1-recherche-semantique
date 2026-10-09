export type Modality = "intro" | "texte" | "image" | "audio" | "video";
export type Source = "cours" | "wikipedia";
export type Method = "bm25" | "dense" | "hybrid" | "hybrid_rerank";

export interface Passage {
	readonly id: string;
	readonly doc_id: string;
	readonly title: string;
	readonly section: string | undefined;
	readonly text: string;
	readonly source: Source;
	readonly modality: Modality;
	readonly url: string | undefined;
	readonly page: number | undefined;
	readonly thumbnail: string | undefined;
}

export interface SearchResult {
	readonly rank: number;
	readonly score: number;
	readonly passage: Passage;
	readonly matched_terms: readonly string[];
}

export interface SearchResponse {
	readonly query: string;
	readonly method: Method;
	readonly language: string;
	readonly abstained: boolean;
	readonly confidence: number | undefined;
	readonly threshold: number | undefined;
	readonly timings_ms: Readonly<Record<string, number>>;
	readonly degraded: readonly { readonly step: string; readonly reason: string }[];
	readonly results: readonly SearchResult[];
}

export interface CompareResponse {
	readonly query: string;
	readonly language: string;
	readonly methods: Readonly<Record<Method, SearchResponse>>;
}

export interface Stats {
	readonly passages: number;
	readonly documents: number;
	readonly built_at: string;
	readonly encoders: Readonly<Record<string, string>>;
	readonly default_encoder: string;
	readonly reranker: string;
	readonly by_source: Readonly<Record<Source, number>>;
	readonly by_modality: Readonly<Record<Modality, number>>;
	readonly llm_enabled: boolean;
	readonly inference_enabled: boolean;
	readonly llm_model: string;
}

export interface MapPoint {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly cluster: number;
	readonly title: string;
	readonly heading: string;
	readonly modality: Modality;
	readonly source: Source;
	readonly page: number | undefined;
	readonly snippet: string;
}

export interface MapCluster {
	readonly id: number;
	readonly label: string;
	readonly keywords: readonly string[];
	readonly size: number;
}

export interface SemanticMap {
	readonly points: readonly MapPoint[];
	readonly clusters: readonly MapCluster[];
}

export interface Projection {
	readonly x: number;
	readonly y: number;
	readonly neighbours: readonly { readonly id: string; readonly score: number }[];
}

export interface Metrics {
	readonly "success@1": number;
	readonly "success@3": number;
	readonly "success@5": number;
	readonly "success@10": number;
	readonly "mrr@10": number;
	readonly "ndcg@10": number;
}

export interface ConfigReport {
	readonly name: string;
	readonly label: string;
	readonly overall: Metrics;
	readonly by_category: Readonly<Record<string, Metrics>>;
	readonly latency_ms: { readonly p50: number; readonly p95: number };
}

export interface AbstentionReport {
	readonly threshold: number;
	readonly balanced_accuracy: number;
	readonly leave_one_out_accuracy: number;
	readonly in_domain_scores: readonly number[];
	readonly out_of_domain_scores: readonly number[];
}

export interface QuestionReport {
	readonly id: string;
	readonly category: string;
	readonly question: string;
	readonly relevant: readonly string[];
	readonly first_relevant_rank: Readonly<Record<string, number | undefined>>;
	readonly confidence: number | undefined;
	readonly rerank_score: number | undefined;
	readonly top: readonly { readonly id: string; readonly title: string; readonly relevant: boolean }[];
}

export interface EvaluationReport {
	readonly generated_at: string;
	readonly corpus: { readonly passages: number; readonly questions: number };
	readonly configs: readonly ConfigReport[];
	readonly abstention: { readonly dense: AbstentionReport; readonly rerank: AbstentionReport };
	readonly questions: readonly QuestionReport[];
}

export interface Quiz {
	readonly question: string;
	readonly choices: readonly string[];
	readonly answer: number;
	readonly explanation: string;
	readonly source: Passage;
}

export interface Game {
	readonly game: number;
	readonly daily: boolean;
}

export interface Guess {
	readonly word: string;
	readonly known: boolean;
	readonly similarity: number;
	readonly temperature: number;
	readonly rank: number | undefined;
	readonly found: boolean;
}

export interface Reveal {
	readonly secret: string;
	readonly neighbours: readonly (readonly [string, number])[];
}

export type Verdict = "pertinent" | "partiel" | "hors_sujet";

export interface Judgement {
	readonly id: number;
	readonly verdict: Verdict;
	readonly reason: string;
}

export interface JudgeReport {
	readonly judgements: readonly Judgement[];
	readonly diagnosis: string;
	readonly precision: number;
	readonly first_relevant_rank: number | undefined;
}

export interface Diagnostics {
	readonly risk: "faible" | "moyen" | "élevé";
	readonly reasons: readonly string[];
	readonly language: string;
	readonly confidence: number | undefined;
	readonly threshold: number | undefined;
	readonly margin: number | undefined;
	readonly lexical_dense_overlap: number | undefined;
	readonly top1_agreement: boolean | undefined;
}

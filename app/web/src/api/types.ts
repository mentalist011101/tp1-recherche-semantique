export type Language = "fr" | "en";
export type Modality = "texte" | "image" | "audio" | "multimodal";

export interface Article {
	readonly doc_id: string;
	readonly titre: string;
	readonly langue: Language;
	readonly modalite: Modality;
	readonly annee: number;
	readonly pages: number;
	readonly source: "arxiv" | "hal";
	readonly venue: string;
	readonly url: string;
	readonly resume: string;
}

export interface ArticleHit {
	readonly rank: number;
	readonly score: number;
	readonly section: string;
	readonly passage: string;
	readonly article: Article;
}

export interface SearchResponse {
	readonly query: string;
	readonly results: readonly ArticleHit[];
	readonly best_score: number | undefined;
	readonly threshold: number;
	readonly abstained: boolean;
	readonly elapsed_ms: number;
}

export interface Scores {
	readonly hit_rate_at_1: number;
	readonly hit_rate_at_5: number;
	readonly mrr_at_10: number;
	readonly ndcg_at_10: number;
}

export interface Stats {
	readonly articles: number;
	readonly settings: {
		readonly index: string;
		readonly embedding_model: string;
		readonly k_passages: number;
		readonly llm_model: string;
		readonly rag_passages: number;
		readonly abstention_threshold: number;
		readonly passages: number;
		readonly evaluation: {
			readonly questions: number;
			readonly pinecone: Scores;
			readonly bm25: Scores;
			readonly biais_langue: Readonly<Record<Language, number>>;
		};
	};
}

export interface SearchFilters {
	readonly langue: Language | undefined;
	readonly modalite: Modality | undefined;
}

export interface ChatSource {
	readonly number: number;
	readonly score: number;
	readonly section: string;
	readonly passage: string;
	readonly article: Article;
}

export type ChatEvent =
	| {
			readonly type: "sources";
			readonly abstained: boolean;
			readonly best_score: number | undefined;
			readonly threshold: number;
			readonly passages: readonly ChatSource[];
	  }
	| { readonly type: "token"; readonly text: string }
	| { readonly type: "error"; readonly message: string }
	| { readonly type: "done" };

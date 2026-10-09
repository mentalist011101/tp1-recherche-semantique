import type { Method, Modality, Verdict } from "../api/types.js";

export const SLIDE_COUNT = 60;

export const MODALITIES: readonly Modality[] = ["intro", "texte", "image", "audio", "video"];

export const MODALITY_LABEL: Readonly<Record<Modality, string>> = {
	intro: "Fondamentaux",
	texte: "Texte",
	image: "Image",
	audio: "Audio",
	video: "Vidéo",
};

export const MODALITY_COLOR: Readonly<Record<Modality, string>> = {
	intro: "#8c6a3f",
	texte: "#0f62ce",
	image: "#4a7a3a",
	audio: "#e0661c",
	video: "#7b3f8f",
};

export const METHODS: readonly Method[] = ["dense", "hybrid", "hybrid_rerank", "bm25"];

export const METHOD_LABEL: Readonly<Record<Method, string>> = {
	bm25: "BM25",
	dense: "Gemini (prod)",
	hybrid: "Hybride RRF",
	hybrid_rerank: "Hybride + rerank",
};

export const METHOD_HINT: Readonly<Record<Method, string>> = {
	bm25: "Correspondance lexicale pondérée (TF-IDF amélioré). Rapide, exact sur les termes, aveugle aux synonymes.",
	dense: "Similarité cosinus entre embeddings Gemini Embedding 2. La configuration de production : la meilleure mesurée.",
	hybrid: "Fusion des rangs BM25 et dense (Reciprocal Rank Fusion). Utile avec un modèle dense faible ; avec Gemini, BM25 ajoute surtout du bruit.",
	hybrid_rerank: "Hybride, puis le cross-encoder bge-reranker relit chaque paire question/passage. Plus lent, et moins bon que Gemini seul.",
};

export const CATEGORY_LABEL: Readonly<Record<string, string>> = {
	lexical: "Lexicale",
	paraphrase: "Paraphrase",
	acronyme: "Acronyme",
	"cross-lingue": "Cross-lingue (EN)",
	faute: "Fautes de frappe",
	raisonnement: "Comparaison / raisonnement",
	"hors-domaine": "Hors domaine",
};

export const CLUSTER_PALETTE: readonly string[] = [
	"#b4400f",
	"#0f62ce",
	"#4a7a3a",
	"#e0661c",
	"#7b3f8f",
	"#8c6a3f",
	"#1f7a7a",
	"#c2185b",
	"#5c6069",
	"#d4a20f",
	"#2b4c8c",
	"#8f3009",
	"#3d8b6d",
	"#a0522d",
];

export const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
	pertinent: "pertinent",
	partiel: "partiel",
	hors_sujet: "hors sujet",
};

export const VERDICT_TONE: Readonly<Record<Verdict, string>> = {
	pertinent: "border-moss/50 bg-moss/12 text-moss",
	partiel: "border-[#a07a10]/45 bg-sun/25 text-[#7a5c08] dark:text-sun",
	hors_sujet: "border-rust/40 bg-rust/10 text-rust",
};

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useSearchParams } from "react-router";

import { api } from "../api/client.js";
import type { Language, Modality, SearchFilters, SearchResponse } from "../api/types.js";
import { ArticleCard } from "../components/ArticleCard.js";
import { Button, Tape } from "../components/paper.js";
import { SearchBar } from "../components/SearchBar.js";
import { ErrorNotice, FilterChip, Spinner } from "../components/ui.js";
import { LANGUAGE_LABEL, LANGUAGES, MODALITIES, MODALITY_LABEL } from "../lib/labels.js";

const SUGGESTIONS = [
	"Les coefficients MFCC contiennent-ils une information sur la prosodie ?",
	"Comment rendre un réseau embarqué robuste aux fautes matérielles ?",
	"How can a speaker verification system resist spoofing attacks?",
	"Retrieval augmented generation over historical newspapers",
	"Améliorer la reconnaissance de caractères en augmentant la résolution des images de texte",
];

export function SearchPage() {
	const [params, setParams] = useSearchParams();
	const query = params.get("q") ?? undefined;
	const filters: SearchFilters = {
		langue: (params.get("langue") as Language | null) ?? undefined,
		modalite: (params.get("modalite") as Modality | null) ?? undefined,
	};
	const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
	const searched = useQuery({
		queryKey: ["search", query, filters.langue, filters.modalite],
		queryFn: () => api.search(query ?? "", filters),
		enabled: Boolean(query),
	});

	const update = (key: string, value: string | undefined) => {
		const next = new URLSearchParams(params);
		if (value === undefined) next.delete(key);
		else next.set(key, value);
		setParams(next, { replace: key !== "q" });
	};

	if (!query) {
		return <Hero onSubmit={(q) => update("q", q)} articles={stats.data?.articles} passages={stats.data?.settings.passages} />;
	}

	return (
		<div className="mx-auto max-w-4xl">
			<p className="eyebrow">Quels articles lire ?</p>
			<div className="mt-4">
				<SearchBar key={query} initial={query} onSubmit={(q) => update("q", q)} size="medium" busy={searched.isFetching} />
			</div>

			<div className="mt-5 flex flex-wrap items-center gap-1.5">
				<span className="label-mono mr-1 text-ink-faint">langue</span>
				<FilterChip active={filters.langue === undefined} onClick={() => update("langue", undefined)}>
					Toutes
				</FilterChip>
				{LANGUAGES.map((language) => (
					<FilterChip key={language} active={filters.langue === language} onClick={() => update("langue", language)}>
						{LANGUAGE_LABEL[language]}
					</FilterChip>
				))}
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-1.5">
				<span className="label-mono mr-1 text-ink-faint">modalité</span>
				<FilterChip active={filters.modalite === undefined} onClick={() => update("modalite", undefined)}>
					Toutes
				</FilterChip>
				{MODALITIES.map((modality) => (
					<FilterChip key={modality} active={filters.modalite === modality} onClick={() => update("modalite", modality)}>
						{MODALITY_LABEL[modality]}
					</FilterChip>
				))}
			</div>

			{searched.data && <Diagnostics response={searched.data} />}

			<div className="mt-8 space-y-5">
				{searched.error && <ErrorNotice error={searched.error} />}
				{searched.isFetching && !searched.data && (
					<div className="flex items-center gap-2 py-10 text-sm text-ink-soft">
						<Spinner /> Recherche dans {stats.data?.settings.passages ?? "…"} passages…
					</div>
				)}
				{searched.data?.abstained && (
					<div className="sticky-note -rotate-[0.6deg] rounded-[var(--radius-card)] border border-kraft-deep/30 bg-kraft/60 p-4 text-sm text-[#16181d]">
						<p className="label-mono text-[#16181d]/50">confiance sous le seuil</p>
						<p className="mt-1.5">
							Aucun article de ce corpus ne semble traiter ce sujet. Les articles ci-dessous sont les plus proches, pas
							nécessairement pertinents.
						</p>
					</div>
				)}
				{searched.data && (
					<section aria-label="Articles retrouvés" className="space-y-4">
						<div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-rule pt-6">
							<h2 className="font-display text-xl font-extrabold tracking-tight">Articles à lire</h2>
							<div className="flex items-center gap-4">
								{!searched.data.abstained && (
									<Button to={`/chat?q=${encodeURIComponent(query)}`} variant="outline" size="sm">
										Obtenir une réponse rédigée
										<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
									</Button>
								)}
								<p className="label-mono text-ink-faint">{searched.data.results.length} articles</p>
							</div>
						</div>
						{searched.data.results.length === 0 && (
							<p className="text-sm text-ink-soft">Aucun article ne correspond à ces filtres.</p>
						)}
						{searched.data.results.map((hit) => (
							<ArticleCard
								key={hit.article.doc_id}
								article={hit.article}
								rank={hit.rank}
								score={hit.score}
								section={hit.section}
								excerpt={hit.passage}
							/>
						))}
					</section>
				)}
			</div>
		</div>
	);
}

function Diagnostics({ response }: { readonly response: SearchResponse }) {
	return (
		<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[0.6875rem] text-ink-faint">
			<span>{response.elapsed_ms.toFixed(0)} ms</span>
			{response.best_score !== undefined && (
				<span
					className={response.abstained ? "text-rust" : undefined}
					title="Similarité du meilleur passage, comparée au seuil d'abstention mesuré dans le notebook (section 7)"
				>
					confiance {response.best_score.toFixed(3)} · seuil {response.threshold.toFixed(3)}
				</span>
			)}
		</div>
	);
}

function Hero({
	onSubmit,
	articles,
	passages,
}: {
	readonly onSubmit: (query: string) => void;
	readonly articles: number | undefined;
	readonly passages: number | undefined;
}) {
	return (
		<div className="grid items-center gap-16 pb-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
			<div className="animate-fade-in">
				<div className="flex items-center gap-3">
					<span className="label-mono text-ink-faint">ENSPY · INF5101</span>
					<span aria-hidden className="h-px w-10 bg-rule-strong" />
					<span className="label-mono text-rust">TP 1 · Module texte</span>
				</div>

				<h1 className="mt-6 text-[clamp(2.5rem,7.5vw,4.6rem)] leading-[0.95] font-extrabold tracking-[-0.035em]">
					<span className="block text-ink">Posez une question,</span>
					<span className="block text-rust">trouvez quoi lire.</span>
				</h1>

				<p className="mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-ink-soft">
					Un moteur de recherche qui comprend le sens des questions, pas seulement leurs mots, dans{" "}
					{articles ?? 50} articles scientifiques courts sur le texte, l'image, l'audio et le multimodal. Question en
					français, article en anglais : il fait le lien.
				</p>

				<div className="mt-9 max-w-xl">
					<SearchBar initial="" onSubmit={onSubmit} placeholder="Comment vérifier qu'une authentification par la voix résiste aux voix falsifiées ?" />
				</div>

				<div className="mt-5 flex max-w-xl flex-wrap gap-2">
					{SUGGESTIONS.map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => onSubmit(suggestion)}
							className="rounded-full border border-rule-strong px-3 py-1.5 text-[0.75rem] text-ink-soft transition-colors hover:border-ember hover:text-ink"
						>
							{suggestion}
						</button>
					))}
				</div>

				<div className="mt-10 flex flex-wrap gap-3">
					<Button to="/corpus" variant="outline" size="sm">
						Parcourir les {articles ?? 50} articles
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
					</Button>
					<Button to="/a-propos" variant="ghost" size="sm">
						Méthode et évaluation
					</Button>
				</div>
			</div>

			<DeskCollage passages={passages} />
		</div>
	);
}

function DeskCollage({ passages }: { readonly passages: number | undefined }) {
	return (
		<div className="relative mx-auto w-full max-w-lg animate-fade-in lg:max-w-none">
			<div className="pointer-events-none absolute -inset-4 -z-10 grid-paper opacity-60 [mask-image:radial-gradient(ellipse_at_center,#000_35%,transparent_78%)] sm:-inset-8" />

			<div className="flex flex-col gap-5 sm:flex-row sm:items-start">
				<figure className="relative w-full -rotate-[2deg] bg-card p-5 pb-8 shadow-[var(--shadow-lift)] sm:w-[54%]">
					<Tape className="-top-3 left-1/2 w-20 -translate-x-1/2 rotate-[2deg]" />
					<p className="label-mono text-ink-faint">arXiv · 2025 · 5 p.</p>
					<p className="mt-3 font-display text-[1.05rem] leading-tight font-extrabold tracking-tight">
						Revisiting MFCCs: Evidence for Spectral-Prosodic Coupling
					</p>
					<p className="mt-3 line-clamp-5 text-[0.8125rem] leading-relaxed text-ink-soft">
						This study challenges the long-held assumption that MFCCs lack relevant temporal information by
						investigating their relationship with speech prosody…
					</p>
					<figcaption className="absolute inset-x-5 bottom-3 font-editorial text-[0.9rem] text-ink-soft italic">
						l'article retrouvé
					</figcaption>
				</figure>

				<div className="flex w-full flex-col gap-5 sm:w-[46%]">
					<div className="sticky-note rotate-[1.6deg] rounded-[var(--radius-card)] border border-kraft-deep/30 bg-kraft/70 p-4 text-[#16181d]">
						<p className="label-mono text-[#16181d]/45">une question en français</p>
						<p className="mt-2 font-mono text-[0.75rem] leading-relaxed">
							<span className="text-[#16181d]/50">Q ·</span> Les coefficients MFCC contiennent-ils une information sur
							la prosodie ?
						</p>
						<p className="mt-1.5 font-mono text-[0.75rem] leading-relaxed text-[#16181d]/70">
							<span className="text-[#16181d]/50">→</span> un article en anglais, au rang 1
						</p>
					</div>

					<div aria-hidden className="-rotate-[1deg] rounded-[var(--radius-card)] bg-night p-4 shadow-[var(--shadow-lift)]">
						<p className="font-mono text-[0.625rem] leading-relaxed text-white/70 sm:text-[0.6875rem]">
							<span className="text-white/35">$</span> recherche "…"
							<br />
							<span className="text-sun">e5</span> <span className="text-white/35">→</span>{" "}
							<span className="text-sun">pinecone</span> <span className="text-white/35">→</span>{" "}
							<span className="text-sun">articles</span>
							<br />
							<span className="text-white/45">{passages ?? 1196} passages · 50 articles</span>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

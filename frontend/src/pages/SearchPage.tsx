import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { api } from "../api/client.js";
import type { Method, SearchResponse } from "../api/types.js";
import { AnswerCard } from "../components/AnswerCard.js";
import { Button, Tape } from "../components/paper.js";
import { ResultCard } from "../components/ResultCard.js";
import { SearchAnalysis } from "../components/SearchAnalysis.js";
import { SearchBar } from "../components/SearchBar.js";
import { DegradedNotice, ErrorNotice, Spinner } from "../components/ui.js";
import { useAsk } from "../hooks/useAsk.js";
import { METHOD_HINT, METHOD_LABEL, METHODS, SLIDE_COUNT } from "../lib/labels.js";

const SUGGESTIONS = [
	"Comment un modèle sait-il qui parle à quel moment ?",
	"Pourquoi le Transformer a remplacé les RNN ?",
	"Quelles images garder quand une vidéo est trop longue ?",
	"What is a spectrogram?",
	"Comment évaluer un système RAG ?",
	"embedings semantiques",
];

type Mode = "answer" | Method;

export function SearchPage() {
	const [params, setParams] = useSearchParams();
	const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
	const query = params.get("q") ?? undefined;
	const llmEnabled = stats.data?.llm_enabled ?? false;
	const mode: Mode = (params.get("mode") as Mode | null) ?? (llmEnabled ? "answer" : "dense");
	const answering = mode === "answer" && llmEnabled;

	const asked = useAsk(query, answering);
	const searched = useQuery({
		queryKey: ["search", query, mode],
		queryFn: () => api.search(query ?? "", mode === "answer" ? "dense" : mode),
		enabled: Boolean(query) && !answering && stats.isSuccess,
	});

	const response = answering ? asked.sources : searched.data;
	const failure = answering ? asked.failure : searched.error;
	const loading = answering ? !asked.sources && !asked.failure : searched.isFetching;
	const resultIds = response?.results.map((r) => r.passage.id) ?? [];

	const diagnostics = useQuery({
		queryKey: ["diagnose", query],
		queryFn: () => api.diagnose(query ?? ""),
		enabled: Boolean(query) && stats.isSuccess,
		staleTime: Infinity,
	});
	const judged = useQuery({
		queryKey: ["judge", query, resultIds],
		queryFn: () => api.judge(query ?? "", resultIds),
		enabled: Boolean(query) && llmEnabled && resultIds.length > 0,
		staleTime: Infinity,
		retry: false,
	});
	const judgementByRank = new Map(judged.data?.judgements.map((j) => [j.id, j]) ?? []);

	const submit = (q: string) => {
		const next = new URLSearchParams(params);
		next.set("q", q);
		setParams(next);
	};
	const setMode = (value: Mode) => {
		const next = new URLSearchParams(params);
		next.set("mode", value);
		setParams(next, { replace: true });
	};

	if (!query) {
		return <Hero onSubmit={submit} passages={stats.data?.passages} documents={stats.data?.documents} />;
	}

	return (
		<div className="mx-auto max-w-4xl">
			<p className="eyebrow">Recherche dans le cours et ses lectures</p>
			<div className="mt-4">
				<SearchBar key={query} initial={query} onSubmit={submit} size="medium" busy={loading} />
			</div>

			<div className="mt-5 flex flex-wrap items-center gap-1.5">
				{llmEnabled && (
					<ModeButton
						active={mode === "answer"}
						onClick={() => setMode("answer")}
						title="Recherche dense Gemini, puis réponse générée avec citations"
					>
						Réponse IA
					</ModeButton>
				)}
				{METHODS.map((method) => (
					<ModeButton key={method} active={mode === method} onClick={() => setMode(method)} title={METHOD_HINT[method]}>
						{METHOD_LABEL[method]}
					</ModeButton>
				))}
			</div>

			{response && <Diagnostics response={response} />}

			<div className="mt-8 space-y-5">
				{answering && asked.answer && (
					<AnswerCard state={asked.answer} model={stats.data?.llm_model} onRetry={asked.retry} />
				)}
				{response && <DegradedNotice degraded={response.degraded} />}
				{failure !== undefined && failure !== null && <ErrorNotice error={failure} />}
				{!answering && response?.abstained && (
					<div className="sticky-note -rotate-[0.6deg] rounded-[var(--radius-card)] border border-kraft-deep/30 bg-kraft/60 p-4 text-sm text-[#16181d]">
						<p className="label-mono text-[#16181d]/50">confiance sous le seuil</p>
						<p className="mt-1.5">
							La question semble hors du périmètre du cours. Les passages ci-dessous sont les plus proches, pas
							nécessairement pertinents.
						</p>
					</div>
				)}
				{loading && !response && (
					<div className="flex items-center gap-2 py-10 text-sm text-ink-soft">
						<Spinner /> Recherche dans {stats.data?.passages ?? "…"} passages…
					</div>
				)}
				{response && response.results.length > 0 && (
					<SearchAnalysis
						diagnostics={diagnostics.data}
						judge={judged.data}
						judging={judged.isFetching}
						judgeError={judged.error}
						llmEnabled={llmEnabled}
						count={response.results.length}
					/>
				)}
				{response && (
					<section aria-label="Passages retrouvés" className="space-y-4">
						<div className="flex items-baseline justify-between gap-3 border-t border-rule pt-6">
							<h2 className="font-display text-xl font-extrabold tracking-tight">
								{answering ? "Les sources de la réponse" : "Passages retrouvés"}
							</h2>
							<p className="label-mono text-ink-faint">{response.results.length} résultats</p>
						</div>
						{response.results.map((result) => (
							<ResultCard
								key={result.passage.id}
								result={result}
								citation={answering ? result.rank : undefined}
								judgement={judgementByRank.get(result.rank)}
							/>
						))}
					</section>
				)}
			</div>
		</div>
	);
}

function Hero({
	onSubmit,
	passages,
	documents,
}: {
	readonly onSubmit: (query: string) => void;
	readonly passages: number | undefined;
	readonly documents: number | undefined;
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
					<span className="block text-rust">retrouvez la slide.</span>
				</h1>

				<p className="mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-ink-soft">
					Un moteur de recherche qui comprend le sens des questions, pas seulement leurs mots, sur les{" "}
					{SLIDE_COUNT} slides du cours et {documents ? documents - SLIDE_COUNT : "des"} articles Wikipédia du
					domaine. En français, en anglais, et même avec des fautes.
				</p>

				<div className="mt-9 max-w-xl">
					<SearchBar initial="" onSubmit={onSubmit} />
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
					<Button to="/carte" variant="outline" size="sm">
						Explorer la carte des embeddings
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
					</Button>
					<Button to="/evaluation" variant="ghost" size="sm">
						Voir l'évaluation
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
				<figure className="relative w-full -rotate-[2deg] bg-card p-2.5 pb-10 shadow-[var(--shadow-lift)] sm:w-[54%]">
					<Tape className="-top-3 left-1/2 w-20 -translate-x-1/2 rotate-[2deg]" />
					<img src="/slides/24.jpg" alt="Slide 24 du cours : l'énoncé du TP" className="aspect-video w-full object-cover" />
					<figcaption className="absolute inset-x-3 bottom-3 font-editorial text-[0.9rem] text-ink-soft italic">
						slide 24, l'énoncé du TP
					</figcaption>
				</figure>

				<div className="flex w-full flex-col gap-5 sm:w-[46%]">
					<div className="sticky-note rotate-[1.6deg] rounded-[var(--radius-card)] border border-kraft-deep/30 bg-kraft/70 p-4 text-[#16181d]">
						<p className="label-mono text-[#16181d]/45">une vraie question</p>
						<p className="mt-2 font-mono text-[0.75rem] leading-relaxed">
							<span className="text-[#16181d]/50">Q ·</span> What is speaker diarization?
						</p>
						<p className="mt-1.5 font-mono text-[0.75rem] leading-relaxed text-[#16181d]/70">
							<span className="text-[#16181d]/50">→</span> slide 48, Diarisation et identification du locuteur
						</p>
					</div>

					<div aria-hidden className="-rotate-[1deg] rounded-[var(--radius-card)] bg-night p-4 shadow-[var(--shadow-lift)]">
						<p className="font-mono text-[0.625rem] leading-relaxed text-white/70 sm:text-[0.6875rem]">
							<span className="text-white/35">$</span> semantica search "…"
							<br />
							<span className="text-sun">embed</span> <span className="text-white/35">→</span>{" "}
							<span className="text-sun">cosinus</span> <span className="text-white/35">→</span>{" "}
							<span className="text-sun">réponse</span> <span className="text-white/35">→</span>{" "}
							<span className="text-sun">juge</span>
							<br />
							<span className="text-white/45">{passages ?? 439} passages · réponse citée</span>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

function ModeButton({
	active,
	onClick,
	title,
	children,
}: {
	readonly active: boolean;
	readonly onClick: () => void;
	readonly title: string;
	readonly children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={clsx(
				"rounded-full px-3.5 py-2 text-[0.8125rem] transition-colors duration-200",
				active ? "bg-ink text-paper" : "border border-rule text-ink-soft hover:bg-ink/5 hover:text-ink",
			)}
		>
			{children}
		</button>
	);
}

function Diagnostics({ response }: { readonly response: SearchResponse }) {
	const total = Object.values(response.timings_ms).reduce((a, b) => a + b, 0);
	return (
		<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[0.6875rem] text-ink-faint">
			{response.language !== "fr" && (
				<span className="text-azure">question en anglais · recherche cross-lingue sur un corpus français</span>
			)}
			<span title={JSON.stringify(response.timings_ms)}>{total.toFixed(0)} ms</span>
			{response.confidence !== undefined && response.threshold !== undefined && (
				<span
					className={clsx(response.abstained && "text-rust")}
					title="Cosinus du meilleur passage comparé au seuil d'abstention calibré sur le jeu d'évaluation"
				>
					confiance {response.confidence.toFixed(2)} · seuil {response.threshold.toFixed(2)}
				</span>
			)}
		</div>
	);
}

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { api } from "../api/client.js";
import type { Method, SearchResponse } from "../api/types.js";
import { SearchBar } from "../components/SearchBar.js";
import { DegradedNotice, ErrorNotice, ModalityBadge, PageHeader, SourceBadge, Spinner } from "../components/ui.js";
import { METHOD_HINT, METHOD_LABEL, METHODS } from "../lib/labels.js";

const EXAMPLES = [
	"Comment transformer un enregistrement de voix en texte écrit ?",
	"What is speaker diarization?",
	"Que signifie GAN ?",
	"reseau de neurone convolutionel pooling",
];

export function ComparePage() {
	const [params, setParams] = useSearchParams();
	const query = params.get("q") ?? "";
	const [hovered, setHovered] = useState<string | undefined>();

	const comparison = useQuery({
		queryKey: ["compare", query],
		queryFn: () => api.compare(query),
		enabled: query.length >= 2,
	});

	return (
		<div>
			<PageHeader eyebrow="Même question, quatre pipelines" title="Le comparateur">
				Survolez un passage pour le suivre d'une colonne à l'autre. C'est ici qu'on voit pourquoi le lexical échoue
				sur les paraphrases et l'anglais, et pourquoi la production a gardé le dense seul.
			</PageHeader>

			<div className="max-w-3xl">
				<SearchBar key={query} initial={query} onSubmit={(q) => setParams({ q })} size="medium" busy={comparison.isFetching} />
				<div className="mt-4 flex flex-wrap gap-2">
					{EXAMPLES.map((example) => (
						<button
							key={example}
							type="button"
							onClick={() => setParams({ q: example })}
							className="rounded-full border border-rule-strong px-3 py-1.5 text-[0.75rem] text-ink-soft transition-colors hover:border-ember hover:text-ink"
						>
							{example}
						</button>
					))}
				</div>
			</div>

			{comparison.isFetching && (
				<div className="mt-10 flex items-center gap-2 text-sm text-ink-soft">
					<Spinner /> Exécution des quatre pipelines…
				</div>
			)}
			{comparison.error && (
				<div className="mt-8">
					<ErrorNotice error={comparison.error} />
				</div>
			)}

			{comparison.data && (
				<>
					<div className="mt-8 max-w-3xl">
						<DegradedNotice degraded={comparison.data.methods.hybrid_rerank.degraded} />
					</div>
					<div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
						{METHODS.map((method, index) => (
							<Column
								key={method}
								index={index}
								method={method}
								response={comparison.data.methods[method]}
								hovered={hovered}
								onHover={setHovered}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function Column({
	index,
	method,
	response,
	hovered,
	onHover,
}: {
	readonly index: number;
	readonly method: Method;
	readonly response: SearchResponse;
	readonly hovered: string | undefined;
	readonly onHover: (id: string | undefined) => void;
}) {
	const total = Object.values(response.timings_ms).reduce((a, b) => a + b, 0);
	return (
		<section className="flex flex-col rounded-[var(--radius-card)] border border-rule bg-card p-5 shadow-[var(--shadow-card)]">
			<header className="mb-4 border-b border-rule pb-4">
				<div className="flex items-baseline justify-between gap-2">
					<p className="label-mono text-ink-faint">{String(index + 1).padStart(2, "0")}</p>
					<span className="font-mono text-[0.6875rem] text-ink-faint">{total.toFixed(0)} ms</span>
				</div>
				<h2 className="mt-2 text-[1.2rem] leading-tight font-extrabold tracking-tight">{METHOD_LABEL[method]}</h2>
				<p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">{METHOD_HINT[method]}</p>
			</header>
			{response.results.length === 0 ? (
				<p className="font-editorial text-[1rem] leading-snug text-ink-soft italic">
					Aucun terme de la question n'apparaît dans le corpus : la recherche lexicale reste muette.
				</p>
			) : (
				<ol className="space-y-2">
					{response.results.map((result) => (
						<li
							key={result.passage.id}
							onMouseEnter={() => onHover(result.passage.id)}
							onMouseLeave={() => onHover(undefined)}
							className={clsx(
								"rounded-[var(--radius-card)] border p-3 transition-colors duration-200",
								hovered === result.passage.id ? "border-ember bg-sun/20" : "border-rule",
							)}
						>
							<div className="mb-2 flex flex-wrap items-center gap-1.5">
								<span className="font-mono text-[0.6875rem] text-ink-faint">{result.rank}</span>
								<SourceBadge source={result.passage.source} page={result.passage.page} />
								<ModalityBadge modality={result.passage.modality} />
							</div>
							<p className="font-display text-[0.9rem] leading-snug font-bold tracking-tight text-ink">{result.passage.title}</p>
							{result.passage.section && (
								<p className="mt-0.5 font-editorial text-[0.9375rem] text-ink-soft italic">{result.passage.section}</p>
							)}
							<p className="mt-1.5 font-mono text-[0.625rem] text-ink-faint">score {result.score.toFixed(3)}</p>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}

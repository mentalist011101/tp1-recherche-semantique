import clsx from "clsx";
import { ArrowRight, ArrowUpRight, Maximize2 } from "lucide-react";
import { useState } from "react";

import type { Judgement, SearchResult } from "../api/types.js";
import { VERDICT_LABEL, VERDICT_TONE } from "../lib/labels.js";
import { Tape } from "./paper.js";
import { SlideViewer } from "./SlideViewer.js";
import { Highlighted, ModalityBadge, SourceBadge } from "./ui.js";

export function ResultCard({
	result,
	citation,
	judgement,
	compact = false,
}: {
	readonly result: SearchResult;
	readonly citation?: number;
	readonly judgement?: Judgement;
	readonly compact?: boolean;
}) {
	const { passage } = result;
	const [expanded, setExpanded] = useState(false);
	const [viewing, setViewing] = useState(false);

	return (
		<article
			id={citation ? `source-${citation}` : undefined}
			className="group relative flex animate-fade-in gap-5 rounded-[var(--radius-card)] border border-rule bg-card p-5 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-6"
		>
			{passage.thumbnail && !compact && (
				<button
					type="button"
					onClick={() => setViewing(true)}
					className="relative hidden w-44 shrink-0 -rotate-[1.5deg] self-start bg-card p-1.5 pb-6 shadow-[var(--shadow-lift)] transition-transform hover:rotate-0 sm:block"
					aria-label={`Agrandir la slide ${passage.page}`}
				>
					<Tape className="-top-3 left-1/2 w-14 -translate-x-1/2" />
					<img src={passage.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
					<span className="absolute inset-x-2 bottom-1.5 flex items-center justify-between font-mono text-[0.625rem] text-ink-faint">
						slide {passage.page}
						<Maximize2 className="size-3" />
					</span>
				</button>
			)}

			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					{citation !== undefined ? (
						<span className="rounded-full bg-sun px-2.5 py-1 font-mono text-[0.6875rem] leading-none text-[#16181d]">
							[{citation}]
						</span>
					) : (
						<span className="label-mono text-ink-faint">{String(result.rank).padStart(2, "0")}</span>
					)}
					<SourceBadge source={passage.source} page={passage.page} />
					<ModalityBadge modality={passage.modality} />
					{judgement && (
						<span
							title={judgement.reason}
							className={clsx(
								"rounded-full border px-2.5 py-1 font-mono text-[0.625rem] leading-none tracking-[0.12em] uppercase",
								VERDICT_TONE[judgement.verdict],
							)}
						>
							juge : {VERDICT_LABEL[judgement.verdict]}
						</span>
					)}
					<span className="ml-auto font-mono text-[0.6875rem] text-ink-faint" title="Score de la méthode">
						{result.score.toFixed(3)}
					</span>
				</div>

				<h3 className="mt-3 text-[1.2rem] leading-tight font-extrabold tracking-tight">{passage.title}</h3>
				{passage.section && (
					<p className="mt-1 font-editorial text-[1.0625rem] leading-snug text-ink-soft italic">{passage.section}</p>
				)}
				<p
					className={clsx(
						"mt-3 text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink-soft",
						!expanded && (compact ? "line-clamp-3" : "line-clamp-4"),
					)}
				>
					<Highlighted text={passage.text} terms={result.matched_terms} />
				</p>

				{judgement && judgement.verdict !== "pertinent" && (
					<p className="mt-3 border-l-2 border-rule-strong pl-3 font-editorial text-[0.9375rem] leading-snug text-ink-soft italic">
						{judgement.reason}
					</p>
				)}

				<footer className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-3 text-[0.8125rem]">
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="inline-flex items-center gap-1.5 font-display font-bold tracking-tight text-ink"
					>
						<ArrowRight className={clsx("size-3.5 text-rust transition-transform", expanded && "rotate-90")} />
						{expanded ? "Réduire" : "Lire tout"}
					</button>
					{passage.page !== undefined && (
						<button type="button" onClick={() => setViewing(true)} className="text-ink transition-colors hover:text-rust">
							Voir la slide
						</button>
					)}
					{passage.url && (
						<a
							href={passage.url}
							target="_blank"
							rel="noreferrer noopener"
							className="inline-flex items-center gap-1 text-ink transition-colors hover:text-rust"
						>
							Wikipédia <ArrowUpRight className="size-3.5" />
						</a>
					)}
				</footer>
			</div>

			{viewing && passage.page !== undefined && (
				<SlideViewer page={passage.page} title={passage.title} onClose={() => setViewing(false)} />
			)}
		</article>
	);
}

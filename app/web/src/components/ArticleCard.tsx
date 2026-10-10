import clsx from "clsx";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useState } from "react";

import type { Article } from "../api/types.js";
import { LanguageBadge, ModalityBadge } from "./ui.js";

export function ArticleCard({
	article,
	rank,
	score,
	section,
	excerpt,
}: {
	readonly article: Article;
	readonly rank?: number;
	readonly score?: number;
	readonly section?: string;
	readonly excerpt: string;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<article className="group relative animate-fade-in rounded-[var(--radius-card)] border border-rule bg-card p-5 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-6">
			<div className="flex flex-wrap items-center gap-2">
				{rank !== undefined && <span className="label-mono text-ink-faint">{String(rank).padStart(2, "0")}</span>}
				<LanguageBadge language={article.langue} />
				<ModalityBadge modality={article.modalite} />
				<span className="font-mono text-[0.6875rem] text-ink-faint">
					{article.source === "arxiv" ? "arXiv" : "HAL"} · {article.annee} · {article.pages} p.
				</span>
				{score !== undefined && (
					<span className="ml-auto font-mono text-[0.6875rem] text-ink-faint" title="Similarité cosinus du meilleur passage">
						{score.toFixed(3)}
					</span>
				)}
			</div>

			<h3 className="mt-3 text-[1.2rem] leading-tight font-extrabold tracking-tight">{article.titre}</h3>
			{section !== undefined && (
				<p className="mt-1 font-editorial text-[1.0625rem] leading-snug text-ink-soft italic">
					Passage retrouvé · {section}
				</p>
			)}
			<p
				className={clsx(
					"mt-3 text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink-soft",
					!expanded && "line-clamp-4",
				)}
			>
				{excerpt}
			</p>

			<footer className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-3 text-[0.8125rem]">
				<button
					type="button"
					onClick={() => setExpanded((value) => !value)}
					className="inline-flex items-center gap-1.5 font-display font-bold tracking-tight text-ink"
				>
					<ArrowRight className={clsx("size-3.5 text-rust transition-transform", expanded && "rotate-90")} />
					{expanded ? "Réduire" : "Lire tout"}
				</button>
				<a
					href={article.url}
					target="_blank"
					rel="noreferrer noopener"
					className="inline-flex items-center gap-1 text-ink transition-colors hover:text-rust"
				>
					Lire l'article (PDF) <ArrowUpRight className="size-3.5" />
				</a>
				{/* Sur arXiv, ce champ est le commentaire libre des auteurs (« 5 pages, 2 figures »), pas une conférence. */}
				{article.source === "hal" && article.venue && (
					<span className="truncate font-mono text-[0.6875rem] text-ink-faint">{article.venue}</span>
				)}
			</footer>
		</article>
	);
}

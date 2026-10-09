import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { ThinkingDots } from "./paper.js";

export type AnswerState =
	| { readonly status: "streaming"; readonly text: string }
	| { readonly status: "done"; readonly text: string }
	| { readonly status: "abstained"; readonly reason: string }
	| { readonly status: "error"; readonly reason: string; readonly text: string };

export function AnswerCard({
	state,
	model,
	onRetry,
}: {
	readonly state: AnswerState;
	readonly model: string | undefined;
	readonly onRetry: () => void;
}) {
	if (state.status === "abstained") {
		return (
			<div className="sticky-note -rotate-[0.8deg] rounded-[var(--radius-card)] border border-kraft-deep/30 bg-kraft/70 p-5 text-[#16181d]">
				<p className="label-mono text-[#16181d]/50">hors du périmètre du cours</p>
				<p className="mt-2 font-display text-lg font-bold tracking-tight">Le moteur préfère s'abstenir.</p>
				<p className="mt-2 text-[0.9375rem] leading-relaxed text-[#16181d]/75">
					{state.reason} Plutôt que d'inventer une réponse, il affiche les passages les plus proches, à titre
					indicatif.
				</p>
			</div>
		);
	}

	const text = state.text;
	return (
		<div className="overflow-hidden rounded-[var(--radius-card)] bg-night shadow-[var(--shadow-lift)]">
			<div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3.5">
				<div className="leading-none">
					<p className="font-display text-[0.875rem] font-bold tracking-tight text-white">Réponse générée</p>
					<p className="mt-1 font-mono text-[0.625rem] text-white/45">ancrée dans les sources citées uniquement</p>
				</div>
				{model && <span className="font-mono text-[0.625rem] text-white/45">{model}</span>}
			</div>
			<div className="px-5 py-5 text-[0.9375rem] leading-relaxed text-white/85">
				<p className="label-mono mb-3 text-sun/70">Semantica</p>
				{text ? (
					<AnswerText text={text} />
				) : (
					<span className="text-white/60">
						<ThinkingDots label="Lecture des sources" />
					</span>
				)}
				{state.status === "streaming" && text && (
					<span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-sun align-middle" />
				)}
				{state.status === "error" && (
					<div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 text-sm text-ember">
						<span>{state.reason}</span>
						<button
							type="button"
							onClick={onRetry}
							className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.12em] text-white/60 uppercase hover:text-white"
						>
							<RotateCcw className="size-3.5" /> Réessayer
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function AnswerText({ text }: { readonly text: string }) {
	return (
		<>
			{text.split("\n").map((line, index) => (
				<p key={index} className="mb-2 last:mb-0">
					{renderInline(line)}
				</p>
			))}
		</>
	);
}

function renderInline(line: string): ReactNode[] {
	return line.split(/(\[\d+\]|\*\*[^*]+\*\*)/g).map((token, index) => {
		const citation = token.match(/^\[(\d+)\]$/);
		if (citation) {
			return (
				<a
					key={index}
					href={`#source-${citation[1]}`}
					className="mx-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-full bg-sun px-1.5 align-middle font-mono text-[0.6875rem] leading-none text-[#16181d] no-underline transition-colors hover:bg-ember hover:text-white"
					onClick={(event) => {
						event.preventDefault();
						document.getElementById(`source-${citation[1]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
					}}
				>
					{citation[1]}
				</a>
			);
		}
		if (token.startsWith("**") && token.endsWith("**")) {
			return (
				<strong key={index} className="font-semibold text-white">
					{token.slice(2, -2)}
				</strong>
			);
		}
		return <span key={index}>{token}</span>;
	});
}

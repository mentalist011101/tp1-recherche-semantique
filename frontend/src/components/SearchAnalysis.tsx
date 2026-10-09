import clsx from "clsx";

import type { Diagnostics, JudgeReport } from "../api/types.js";
import { ThinkingDots } from "./paper.js";

const RISK_TONE: Readonly<Record<Diagnostics["risk"], string>> = {
	faible: "bg-moss text-white",
	moyen: "bg-sun text-[#16181d]",
	élevé: "bg-rust text-white",
};

export function SearchAnalysis({
	diagnostics,
	judge,
	judging,
	judgeError,
	llmEnabled,
	count,
}: {
	readonly diagnostics: Diagnostics | undefined;
	readonly judge: JudgeReport | undefined;
	readonly judging: boolean;
	readonly judgeError: unknown;
	readonly llmEnabled: boolean;
	readonly count: number;
}) {
	return (
		<section
			aria-label="Analyse de la recherche"
			className="grid overflow-hidden rounded-[var(--radius-card)] border border-rule bg-card shadow-[var(--shadow-card)] md:grid-cols-2"
		>
			<div className="border-b border-rule p-5 md:border-r md:border-b-0">
				<div className="flex items-center justify-between gap-3">
					<p className="label-mono text-ink-faint">Signaux de confiance</p>
					{diagnostics && (
						<span className={clsx("rounded-full px-2.5 py-1 font-mono text-[0.625rem] leading-none tracking-[0.12em] uppercase", RISK_TONE[diagnostics.risk])}>
							risque {diagnostics.risk}
						</span>
					)}
				</div>
				{diagnostics ? (
					<>
						<ConfidenceGauge confidence={diagnostics.confidence} threshold={diagnostics.threshold} />
						<ul className="mt-4 space-y-2 text-[0.875rem] leading-relaxed text-ink-soft">
							{diagnostics.reasons.map((reason) => (
								<li key={reason} className="flex gap-2.5">
									<span aria-hidden className="mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
									{reason}
								</li>
							))}
						</ul>
						{diagnostics.lexical_dense_overlap !== undefined && (
							<p className="mt-3 font-mono text-[0.6875rem] text-ink-faint">
								accord BM25 / dense sur le top 5 : {Math.round(diagnostics.lexical_dense_overlap * 100)} %
							</p>
						)}
					</>
				) : (
					<p className="mt-4 text-ink-faint">
						<ThinkingDots label="Calcul des signaux" />
					</p>
				)}
			</div>

			<div className="p-5">
				<p className="label-mono text-ink-faint">Juge LLM · erreur estimée</p>
				{!llmEnabled ? (
					<p className="mt-4 text-sm text-ink-soft">Le juge nécessite une clé Gemini côté serveur.</p>
				) : judge ? (
					<>
						<div className="mt-3 flex items-end gap-6">
							<div>
								<p className="font-display text-4xl font-extrabold tracking-tight">{Math.round(judge.precision * 100)} %</p>
								<p className="font-mono text-[0.6875rem] text-ink-faint">précision@{count} estimée</p>
							</div>
							<div>
								<p className="font-display text-4xl font-extrabold tracking-tight">{judge.first_relevant_rank ?? "—"}</p>
								<p className="font-mono text-[0.6875rem] text-ink-faint">rang du 1er pertinent</p>
							</div>
						</div>
						<p className="mt-4 font-editorial text-[1.0625rem] leading-snug text-ink-soft italic">{judge.diagnosis}</p>
						<p className="mt-3 font-mono text-[0.625rem] text-ink-faint">
							estimation par Gemini, sans vérité terrain : à lire comme un avis, pas comme une mesure
						</p>
					</>
				) : judging ? (
					<p className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
						<ThinkingDots label="Jugement en cours" /> Gemini relit chaque passage…
					</p>
				) : judgeError ? (
					<p className="mt-4 text-sm text-rust">
						{judgeError instanceof Error ? judgeError.message : "Le juge n'a pas pu répondre."}
					</p>
				) : null}
			</div>
		</section>
	);
}

function ConfidenceGauge({ confidence, threshold }: { readonly confidence: number | undefined; readonly threshold: number | undefined }) {
	if (confidence === undefined) return null;
	// Les cosinus utiles vivent entre 0,4 et 0,9 : on cadre la jauge sur cette plage.
	const scale = (value: number) => `${Math.min(100, Math.max(0, ((value - 0.4) / 0.5) * 100))}%`;
	return (
		<div className="mt-4">
			<div className="relative h-2 rounded-full bg-ink/10">
				<div
					className={clsx("absolute inset-y-0 left-0 rounded-full", threshold !== undefined && confidence < threshold ? "bg-rust" : "bg-ember")}
					style={{ width: scale(confidence) }}
				/>
				{threshold !== undefined && (
					<div className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: scale(threshold) }} title="Seuil d'abstention calibré" />
				)}
			</div>
			<p className="mt-2 font-mono text-[0.6875rem] text-ink-faint">
				cosinus {confidence.toFixed(3)}
				{threshold !== undefined && <> · seuil {threshold.toFixed(3)}</>}
			</p>
		</div>
	);
}

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { MapPinned } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { api } from "../api/client.js";
import type { AbstentionReport, ConfigReport, EvaluationReport, Metrics } from "../api/types.js";
import { Tape, TornEdge } from "../components/paper.js";
import { ErrorNotice, PageHeader, Spinner } from "../components/ui.js";
import { CATEGORY_LABEL } from "../lib/labels.js";
import { FINDINGS } from "./evaluationFindings.js";

const PRODUCTION = "dense-gemini";
const BASELINE = "bm25";

const METRIC_COLUMNS: readonly { readonly key: keyof Metrics; readonly label: string; readonly hint: string }[] = [
	{ key: "success@1", label: "Succès@1", hint: "Part des questions dont le 1er résultat est pertinent" },
	{ key: "success@5", label: "Succès@5", hint: "Au moins un passage pertinent dans les 5 premiers" },
	{ key: "mrr@10", label: "MRR@10", hint: "Moyenne de 1/rang du premier passage pertinent" },
	{ key: "ndcg@10", label: "nDCG@10", hint: "Qualité de l'ordre, en tenant compte de tous les passages pertinents" },
];

const KPI_NOTES = [
	{ tone: "bg-sun text-[#16181d]", rotation: "-rotate-[1.5deg]" },
	{ tone: "border border-rule bg-card text-ink", rotation: "rotate-[1deg]" },
	{ tone: "bg-kraft/70 text-[#16181d]", rotation: "-rotate-[0.8deg]" },
	{ tone: "border border-rule bg-card text-ink", rotation: "rotate-[1.6deg]" },
] as const;

export function EvaluationPage() {
	const report = useQuery({ queryKey: ["evaluation"], queryFn: api.evaluation, staleTime: Infinity });

	return (
		<div>
			<PageHeader eyebrow="Mesurer avant d'affirmer" title="L'évaluation">
				{report.data?.corpus.questions ?? 65} questions annotées à la main, avec leurs passages pertinents connus,
				réparties en catégories qui ciblent chacune une faiblesse connue de la recherche : paraphrases, acronymes,
				anglais, fautes de frappe, questions hors sujet. Toutes les méthodes sont jouées sur le même jeu, avec les
				mêmes métriques.
			</PageHeader>

			{report.isPending && (
				<div className="flex items-center gap-2 text-sm text-ink-soft">
					<Spinner /> Chargement du rapport…
				</div>
			)}
			{report.error && <ErrorNotice error={report.error} />}
			{report.data && <Report report={report.data} />}
		</div>
	);
}

function Report({ report }: { readonly report: EvaluationReport }) {
	const production = report.configs.find((c) => c.name === PRODUCTION);
	const baseline = report.configs.find((c) => c.name === BASELINE);
	const inDomain = report.questions.filter((q) => q.relevant.length > 0).length;

	return (
		<div className="space-y-20">
			{production && baseline && (
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
					{METRIC_COLUMNS.map((column, index) => (
						<Kpi
							key={column.key}
							label={column.label}
							hint={column.hint}
							value={production.overall[column.key]}
							baseline={baseline.overall[column.key]}
							note={KPI_NOTES[index % KPI_NOTES.length] ?? KPI_NOTES[0]}
						/>
					))}
				</div>
			)}

			<section>
				<SectionTitle
					index="01"
					title="Toutes les configurations"
					subtitle={`Questions du domaine uniquement (${inDomain}). Latence médiane par question, appels d'API inclus.`}
				/>
				<ConfigTable configs={report.configs} />
			</section>

			<section>
				<SectionTitle
					index="02"
					title="Succès@5 par catégorie de question"
					subtitle="Où chaque méthode casse. Lire en colonnes : une catégorie, toutes les configurations."
				/>
				<CategoryHeatmap configs={report.configs} />
			</section>

			<section className="relative bg-night py-16 text-white night-grid">
				<TornEdge position="top" className="text-night" />
				<TornEdge position="bottom" className="text-night" />
				<div className="px-5 sm:px-8">
					<p className="eyebrow text-white/60">03 · Savoir dire « je ne sais pas »</p>
					<h2 className="mt-2 text-[clamp(1.6rem,3.6vw,2.4rem)] leading-tight text-white">L'abstention calibrée</h2>
					<p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-white/70">
						Score du meilleur passage pour les questions du domaine et hors domaine, selon deux signaux. Le seuil est
						choisi pour maximiser l'exactitude équilibrée, puis validé en leave-one-out.
					</p>
					<div className="mt-10 grid gap-5 lg:grid-cols-2">
						<AbstentionPlot title="Cosinus dense (production)" report={report.abstention.dense} />
						<AbstentionPlot title="Score du reranker (comparaison)" report={report.abstention.rerank} />
					</div>
				</div>
			</section>

			{FINDINGS.length > 0 && (
				<section>
					<SectionTitle index="04" title="Ce que les erreurs nous apprennent" subtitle="Analyse qualitative des échecs, question par question." />
					<div className="grid gap-5 md:grid-cols-2">
						{FINDINGS.map((finding, index) => (
							<article
								key={finding.title}
								className="relative rounded-[var(--radius-card)] border border-rule bg-card p-6 shadow-[var(--shadow-card)]"
							>
								{index % 3 === 0 && <Tape className="-top-3 left-8 w-16" />}
								<p className="label-mono text-rust">{finding.tag}</p>
								<h3 className="mt-2 text-[1.2rem] leading-tight font-extrabold tracking-tight">{finding.title}</h3>
								<p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{finding.body}</p>
							</article>
						))}
					</div>
				</section>
			)}

			<section>
				<SectionTitle
					index={FINDINGS.length > 0 ? "05" : "04"}
					title="Détail par question"
					subtitle="Rang du premier passage pertinent pour chaque configuration (— : absent du top 10)."
				/>
				<QuestionTable report={report} />
			</section>

			<p className="font-mono text-[0.6875rem] text-ink-faint">
				Rapport généré le {report.generated_at} sur {report.corpus.passages} passages.
			</p>
		</div>
	);
}

function Kpi({
	label,
	hint,
	value,
	baseline,
	note,
}: {
	readonly label: string;
	readonly hint: string;
	readonly value: number;
	readonly baseline: number;
	readonly note: (typeof KPI_NOTES)[number];
}) {
	const delta = value - baseline;
	return (
		<div
			title={hint}
			className={clsx("sticky-note flex h-40 flex-col justify-between rounded-[var(--radius-card)] p-5 transition-transform hover:rotate-0", note.tone, note.rotation)}
		>
			<p className="label-mono opacity-55">{label}</p>
			<p className="font-display text-5xl font-extrabold tracking-tight">{pct(value)}</p>
			<p className="font-mono text-[0.6875rem] opacity-70">
				{delta >= 0 ? "+" : ""}
				{(delta * 100).toFixed(1)} pts vs BM25
			</p>
		</div>
	);
}

function ConfigTable({ configs }: { readonly configs: readonly ConfigReport[] }) {
	const best = Object.fromEntries(METRIC_COLUMNS.map((c) => [c.key, Math.max(...configs.map((cfg) => cfg.overall[c.key]))]));
	return (
		<div className="overflow-x-auto rounded-[var(--radius-card)] border border-rule bg-card shadow-[var(--shadow-card)]">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-rule-strong text-left">
						<th className="label-mono px-5 py-4 font-medium text-ink-faint">Configuration</th>
						{METRIC_COLUMNS.map((c) => (
							<th key={c.key} className="label-mono px-4 py-4 font-medium text-ink-faint" title={c.hint}>
								{c.label}
							</th>
						))}
						<th className="label-mono px-5 py-4 text-right font-medium text-ink-faint">p50</th>
					</tr>
				</thead>
				<tbody>
					{configs.map((config) => (
						<tr key={config.name} className={clsx("border-b border-rule last:border-0", config.name === PRODUCTION && "bg-sun/15")}>
							<td className="px-5 py-3.5 font-display font-bold tracking-tight">
								{config.label}
								{config.name === PRODUCTION && (
									<span className="ml-2 rounded-full border border-ember/45 bg-ember/10 px-2 py-0.5 font-mono text-[0.5625rem] tracking-[0.12em] text-rust uppercase">
										prod
									</span>
								)}
							</td>
							{METRIC_COLUMNS.map((c) => (
								<td key={c.key} className="px-4 py-3.5">
									<div className="flex items-center gap-2">
										<div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink/10">
											<div className="h-full rounded-full bg-ember" style={{ width: pct(config.overall[c.key]) }} />
										</div>
										<span className={clsx("font-mono text-xs", config.overall[c.key] === best[c.key] && "font-semibold text-rust")}>
											{config.overall[c.key].toFixed(3)}
										</span>
									</div>
								</td>
							))}
							<td className="px-5 py-3.5 text-right font-mono text-xs text-ink-soft">{config.latency_ms.p50.toFixed(0)} ms</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function CategoryHeatmap({ configs }: { readonly configs: readonly ConfigReport[] }) {
	const categories = Object.keys(configs[0]?.by_category ?? {});
	return (
		<div className="overflow-x-auto rounded-[var(--radius-card)] border border-rule bg-card p-2 shadow-[var(--shadow-card)]">
			<table className="w-full border-separate border-spacing-1 text-xs">
				<thead>
					<tr>
						<th />
						{categories.map((category) => (
							<th key={category} className="label-mono px-2 py-2 font-medium text-ink-faint">
								{CATEGORY_LABEL[category] ?? category}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{configs.map((config) => (
						<tr key={config.name}>
							<td className="px-2 py-1.5 font-display font-bold whitespace-nowrap tracking-tight">{config.label}</td>
							{categories.map((category) => {
								const value = config.by_category[category]?.["success@5"] ?? 0;
								return (
									<td
										key={category}
										className="rounded-[2px] px-2 py-2.5 text-center font-mono font-semibold"
										style={{ backgroundColor: heat(value), color: value > 0.5 ? "#fffdf8" : "#16181d" }}
									>
										{pct(value)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function AbstentionPlot({ title, report }: { readonly title: string; readonly report: AbstentionReport }) {
	const all = [...report.in_domain_scores, ...report.out_of_domain_scores];
	const min = Math.min(...all);
	const max = Math.max(...all);
	const x = (v: number) => 30 + ((v - min) / (max - min || 1)) * 450;
	return (
		<div className="rounded-[var(--radius-card)] border border-white/10 bg-white/[0.04] p-5">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h3 className="font-display text-[1rem] font-bold tracking-tight text-white">{title}</h3>
				<span className="font-mono text-[0.6875rem] text-white/55">
					équilibrée <span className="text-sun">{pct(report.balanced_accuracy)}</span> · leave-one-out{" "}
					<span className="text-sun">{pct(report.leave_one_out_accuracy)}</span>
				</span>
			</div>
			<svg viewBox="0 0 500 120" className="mt-4 w-full" role="img" aria-label={`Distribution des scores : ${title}`}>
				<line x1={x(report.threshold)} x2={x(report.threshold)} y1={8} y2={100} stroke="#f2ce1b" strokeWidth={2} strokeDasharray="4 3" />
				<text x={x(report.threshold)} y={114} textAnchor="middle" fill="#f2ce1b" className="font-mono text-[10px]">
					seuil {report.threshold.toFixed(2)}
				</text>
				<text x={0} y={34} fill="rgba(255,255,255,0.45)" className="font-mono text-[9px]">
					dom.
				</text>
				<text x={0} y={79} fill="rgba(255,255,255,0.45)" className="font-mono text-[9px]">
					hors
				</text>
				{report.in_domain_scores.map((score, i) => (
					<circle key={`in-${i}`} cx={x(score)} cy={40 + ((i * 7) % 15) - 7} r={4} fill="#5b9bf0" fillOpacity={0.75} />
				))}
				{report.out_of_domain_scores.map((score, i) => (
					<circle key={`out-${i}`} cx={x(score)} cy={78 + ((i * 7) % 15) - 7} r={4.5} fill="#e0661c" />
				))}
			</svg>
		</div>
	);
}

function QuestionTable({ report }: { readonly report: EvaluationReport }) {
	const [category, setCategory] = useState<string | undefined>();
	const [onlyFailures, setOnlyFailures] = useState(false);
	const categories = useMemo(() => [...new Set(report.questions.map((q) => q.category))], [report]);
	const configs = report.configs;
	const rows = report.questions.filter(
		(q) =>
			(!category || q.category === category) &&
			(!onlyFailures || (q.relevant.length > 0 && !isTop5(q.first_relevant_rank[PRODUCTION]))),
	);

	return (
		<div>
			<div className="mb-4 flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
				<FilterChip active={!category} onClick={() => setCategory(undefined)}>
					Toutes
				</FilterChip>
				{categories.map((c) => (
					<FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
						{CATEGORY_LABEL[c] ?? c}
					</FilterChip>
				))}
				<label className="ml-auto inline-flex items-center gap-2 text-ink-soft">
					<input type="checkbox" checked={onlyFailures} onChange={(e) => setOnlyFailures(e.target.checked)} className="accent-ember" />
					Échecs de la production uniquement
				</label>
			</div>
			<div className="overflow-x-auto rounded-[var(--radius-card)] border border-rule bg-card shadow-[var(--shadow-card)]">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-rule-strong text-left">
							<th className="label-mono px-4 py-3 font-medium text-ink-faint">Question</th>
							{configs.map((c) => (
								<th key={c.name} className="label-mono px-1.5 py-3 text-center font-medium text-ink-faint" title={c.label}>
									{shortLabel(c.name)}
								</th>
							))}
							<th />
						</tr>
					</thead>
					<tbody>
						{rows.map((question) => (
							<tr key={question.id} className="border-b border-rule last:border-0 hover:bg-ink/[0.025]">
								<td className="max-w-md px-4 py-2.5">
									<div className="text-ink">{question.question}</div>
									<div className="mt-0.5 font-mono text-[0.625rem] text-ink-faint">
										{CATEGORY_LABEL[question.category] ?? question.category}
										{question.top[0] && <> · top 1 : {question.top[0].title}</>}
									</div>
								</td>
								{configs.map((c) => (
									<td key={c.name} className="px-1.5 py-2.5 text-center">
										<RankCell rank={question.first_relevant_rank[c.name]} outOfDomain={question.relevant.length === 0} />
									</td>
								))}
								<td className="px-2 py-2.5">
									<Link
										to={`/carte?q=${encodeURIComponent(question.question)}&expected=${encodeURIComponent(question.relevant.join(","))}`}
										className="inline-flex rounded-full p-2 text-ink-faint transition-colors hover:bg-ink/5 hover:text-rust"
										title="Voir la question sur la carte des embeddings"
									>
										<MapPinned className="size-4" />
									</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function RankCell({ rank, outOfDomain }: { readonly rank: number | undefined; readonly outOfDomain: boolean }) {
	if (outOfDomain) return <span className="font-mono text-[0.625rem] text-ink-faint">n/a</span>;
	return (
		<span
			className={clsx(
				"inline-flex size-7 items-center justify-center rounded-[3px] font-mono text-xs font-semibold",
				rank === 1 && "bg-moss text-white",
				rank !== undefined && rank > 1 && rank <= 5 && "bg-sun text-[#16181d]",
				(rank === undefined || rank > 5) && "bg-rust/15 text-rust",
			)}
		>
			{rank ?? "—"}
		</span>
	);
}

function FilterChip({ active, onClick, children }: { readonly active: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={clsx(
				"rounded-full px-3.5 py-2 transition-colors",
				active ? "bg-ink text-paper" : "border border-rule text-ink-soft hover:text-ink",
			)}
		>
			{children}
		</button>
	);
}

function SectionTitle({ index, title, subtitle }: { readonly index: string; readonly title: string; readonly subtitle: string }) {
	return (
		<div className="mb-6 max-w-2xl">
			<p className="eyebrow">
				{index} · {subtitle}
			</p>
			<h2 className="mt-2 text-[clamp(1.6rem,3.6vw,2.4rem)] leading-tight">{title}</h2>
		</div>
	);
}

function shortLabel(name: string): string {
	return (
		{
			bm25: "BM25",
			"dense-minilm": "MiniLM",
			"dense-e5-small": "e5",
			"dense-gemini": "Prod",
			"hybrid-naive": "Hyb.∅",
			hybrid: "Hyb.",
			"hybrid-rerank": "Rerank",
		}[name] ?? name
	);
}

function isTop5(rank: number | undefined): boolean {
	return rank !== undefined && rank <= 5;
}

function heat(value: number): string {
	return `color-mix(in oklab, #4a7a3a ${Math.round(value * 100)}%, #e8d9c4)`;
}

function pct(value: number): string {
	return `${(value * 100).toFixed(0)}%`;
}

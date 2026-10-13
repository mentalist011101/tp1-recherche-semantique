import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";

import { api } from "../api/client.js";
import type { Scores } from "../api/types.js";
import { Button, Tape, TornEdge } from "../components/paper.js";
import { GithubIcon, PageHeader } from "../components/ui.js";
import { AUTHOR, PORTFOLIO_URL, REPOSITORY_URL } from "../lib/links.js";

const TP_STATEMENT = [
	"Importer 50 documents courts ou extraits de cours.",
	"Créer des embeddings avec un modèle sentence-transformer ou une API locale/serveur.",
	"Construire un petit moteur de recherche sémantique en Python.",
	"Tester des questions et analyser les erreurs de récupération.",
];

const STEPS = [
	{ title: "Corpus", body: "50 PDF de 2 à 6 pages, choisis à la main sur arXiv et HAL" },
	{ title: "Markdown", body: "pymupdf4llm ; page de garde HAL et références retirées" },
	{ title: "Passages", body: "Découpage LangChain par intertitres, puis 1 000 caractères" },
	{ title: "Index", body: "multilingual-e5-large et Pinecone serverless, 1 024 dimensions" },
	{ title: "Articles", body: "Meilleur passage de chaque article, seuil d'abstention" },
	{ title: "Réponse", body: "gpt-oss-120b (Groq) rédige à partir des passages et cite ses sources" },
];

const DECISIONS = [
	{
		title: "Des bibliothèques partout, du code maison là où le corpus l'exige",
		body: "pymupdf4llm, LangChain, Pinecone et ranx font le travail standard. Le code écrit à la main se limite à ce qu'aucune bibliothèque ne sait faire pour ce corpus : retirer la page de garde HAL et les références, remonter des passages aux articles.",
	},
	{
		title: "Un modèle multilingue hébergé",
		body: "multilingual-e5-large tourne chez Pinecone : une question en français retrouve un article en anglais, et rien de lourd ne s'exécute sur le serveur de l'application.",
	},
	{
		title: "Chercher des passages, répondre par articles",
		body: "Un embedding d'article entier serait flou. On cherche donc parmi 1 196 passages, puis chaque article prend le score de son meilleur passage, affiché comme justification.",
	},
	{
		title: "Un contexte dans chaque passage",
		body: "Chaque passage est encodé précédé de « titre de l'article › intertitre » : un passage isolé comme « Our method outperforms… » ne dit pas de quoi il parle.",
	},
	{
		title: "Une erreur d'évaluation devenue un correctif",
		body: "L'analyse des erreurs a révélé des passages réduits à un numéro de page, dont l'embedding se résumait au titre de l'article. Les passages de moins de 20 mots sont désormais écartés.",
	},
	{
		title: "Une réponse rédigée, des sources vérifiables",
		body: "L'onglet Chat fait rédiger la réponse par gpt-oss-120b, servi par Groq, à partir des seuls passages retrouvés. Le modèle cite des numéros de passage ; titres, années et liens viennent des métadonnées, jamais du modèle, qui pourrait les inventer.",
	},
	{
		title: "Savoir dire « rien dans ce corpus »",
		body: "Sous un seuil de similarité mesuré sur les questions hors corpus, le moteur prévient que les résultats ne sont sans doute pas pertinents, et le chat n'interroge pas le modèle. Les scores e5 étant tassés, ce seuil reste fragile.",
	},
];

const METRICS: readonly { readonly key: keyof Scores; readonly label: string }[] = [
	{ key: "hit_rate_at_1", label: "Hit@1" },
	{ key: "hit_rate_at_5", label: "Hit@5" },
	{ key: "mrr_at_10", label: "MRR@10" },
	{ key: "ndcg_at_10", label: "nDCG@10" },
];

export function AboutPage() {
	const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
	const evaluation = stats.data?.settings.evaluation;

	return (
		<div className="space-y-20">
			<div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
				<PageHeader eyebrow="Du TP au produit" title="À propos du moteur">
					Ce moteur est la réalisation du premier travail pratique du cours INF5101, Traitement multimédia des données,
					à l'École Nationale Supérieure Polytechnique de Yaoundé. Toute la démarche (corpus, découpage, index,
					évaluation, analyse des erreurs) est déroulée pas à pas dans un notebook ; cette application en est la
					version utilisable par les étudiants.
				</PageHeader>

				<div className="sticky-note relative mb-12 -rotate-[1.4deg] rounded-[var(--radius-card)] border border-kraft-deep/30 bg-kraft/70 p-6 text-[#16181d]">
					<Tape className="-top-3 left-1/2 -translate-x-1/2" label="slide 24" />
					<p className="label-mono text-[#16181d]/50">l'énoncé du TP</p>
					<ol className="mt-3 space-y-2 font-mono text-[0.8125rem] leading-relaxed">
						{TP_STATEMENT.map((line, index) => (
							<li key={line} className="flex gap-3">
								<span className="text-[#16181d]/45">{index + 1}.</span>
								{line}
							</li>
						))}
					</ol>
				</div>
			</div>

			<section className="relative bg-night py-16 text-white night-grid">
				<TornEdge position="top" className="text-night" />
				<TornEdge position="bottom" className="text-night" />
				<div className="px-5 sm:px-8">
					<p className="eyebrow text-white/60">Du PDF à la réponse</p>
					<h2 className="mt-2 text-[clamp(1.6rem,3.6vw,2.4rem)] leading-tight text-white">La chaîne de traitement</h2>
					<ol className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
						{STEPS.map((step, index) => (
							<li key={step.title} className="border-t border-white/15 pt-4">
								<p className="font-mono text-[0.6875rem] text-sun">{String(index + 1).padStart(2, "0")}</p>
								<p className="mt-2 font-display text-lg font-extrabold tracking-tight">{step.title}</p>
								<p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/65">{step.body}</p>
							</li>
						))}
					</ol>
				</div>
			</section>

			{evaluation && (
				<section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
					<div>
						<p className="eyebrow">Mesuré, pas supposé</p>
						<h2 className="mt-2 text-[clamp(1.6rem,3.6vw,2.4rem)] leading-tight">Évaluation</h2>
						<p className="mt-5 text-[0.975rem] leading-relaxed text-ink-soft">
							{evaluation.questions} questions annotées à la main (factuelles, paraphrases, cross-lingues), comparées à
							une recherche lexicale BM25 sur les mêmes passages. Le moteur sémantique l'emporte sur les quatre
							métriques, avec un écart significatif.
						</p>
						<p className="mt-4 text-[0.975rem] leading-relaxed text-ink-soft">
							<strong className="text-ink">Biais de langue.</strong> Le corpus ne compte que 30 % d'articles français,
							mais une question en français en ramène {Math.round(evaluation.biais_langue.fr * 100)} % dans ses cinq
							premiers résultats, contre {Math.round(evaluation.biais_langue.en * 100)} % pour une question en anglais.
							Les filtres de langue de la recherche permettent de le contourner.
						</p>
					</div>
					<div className="self-start overflow-x-auto rounded-[var(--radius-card)] border border-rule bg-card shadow-[var(--shadow-card)]">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-rule text-left">
									<th className="px-5 py-3 font-display font-extrabold">Moteur</th>
									{METRICS.map((metric) => (
										<th key={metric.key} className="px-3 py-3 text-right font-mono text-[0.75rem] font-medium text-ink-soft">
											{metric.label}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								<ScoreRow label="BM25 (lexical)" scores={evaluation.bm25} />
								<ScoreRow label="Pinecone + e5" scores={evaluation.pinecone} highlight />
							</tbody>
						</table>
					</div>
				</section>
			)}

			<section>
				<p className="eyebrow">Ce qui a été décidé, et pourquoi</p>
				<h2 className="mt-2 text-[clamp(1.6rem,3.6vw,2.4rem)] leading-tight">Choix techniques</h2>
				<div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
					{DECISIONS.map((decision, index) => (
						<article
							key={decision.title}
							className="relative rounded-[var(--radius-card)] border border-rule bg-card p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"
						>
							<p className="label-mono text-ink-faint">{String(index + 1).padStart(2, "0")} — décision</p>
							<h3 className="mt-3 text-[1.2rem] leading-tight font-extrabold tracking-tight">{decision.title}</h3>
							<p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{decision.body}</p>
						</article>
					))}
				</div>
			</section>

			<section className="flex flex-col items-start gap-6 border-t border-rule pt-10 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="eyebrow">Réalisé par</p>
					<p className="mt-1 font-display text-2xl font-extrabold tracking-tight">{AUTHOR}</p>
					<p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
						Corpus : 50 articles en accès libre sur arXiv et HAL. L'application affiche leur résumé et renvoie vers le
						PDF chez son éditeur ; elle ne redistribue pas les textes.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<Button href={REPOSITORY_URL} variant="outline" size="sm">
						<GithubIcon className="size-4" /> Code et notebook
					</Button>
					<Button href="/api/docs" variant="outline" size="sm">
						API
						<ArrowUpRight className="size-4" />
					</Button>
					<Button href={PORTFOLIO_URL} size="sm">
						Portfolio
						<ArrowUpRight className="size-4" />
					</Button>
				</div>
			</section>
		</div>
	);
}

function ScoreRow({
	label,
	scores,
	highlight = false,
}: {
	readonly label: string;
	readonly scores: Scores;
	readonly highlight?: boolean;
}) {
	return (
		<tr className={highlight ? "bg-ember/[0.07]" : "border-b border-rule"}>
			<td className="px-5 py-3 font-medium">{label}</td>
			{METRICS.map((metric) => (
				<td key={metric.key} className="px-3 py-3 text-right font-mono text-[0.8125rem]">
					{scores[metric.key].toFixed(2).replace(".", ",")}
				</td>
			))}
		</tr>
	);
}

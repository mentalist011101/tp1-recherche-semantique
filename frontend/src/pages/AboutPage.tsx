import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";

import { api } from "../api/client.js";
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
	{ title: "Ingestion", body: "PDF du cours (PyMuPDF) et 51 articles Wikipédia (API)" },
	{ title: "Découpage", body: "1 slide = 1 passage ; articles par section, 180 mots au plus" },
	{ title: "Indexation", body: "Embeddings Gemini (768 d) par API, BM25 en référence" },
	{ title: "Recherche", body: "Cosinus exact sur les 439 passages, abstention calibrée" },
	{ title: "Réponse", body: "Gemini Flash, citations [n], juge LLM de la recherche" },
];

const DECISIONS = [
	{
		title: "Le dense seul, choisi par la mesure",
		body: "L'hybride BM25 + dense et le reranking étaient prévus. L'évaluation a montré qu'avec Gemini Embedding 2, ils dégradent le classement (Succès@1 de 95 % à 77-81 %). La production utilise donc le dense seul ; les autres pipelines restent dans le comparateur.",
	},
	{
		title: "Mesurer chaque recherche, pas seulement le jeu de test",
		body: "Pour une question quelconque, il n'y a pas de vérité terrain. Chaque recherche affiche donc des signaux de confiance (marge au seuil, accord entre BM25 et le dense) et l'avis d'un juge LLM sur chaque passage : une précision estimée, présentée comme telle.",
	},
	{
		title: "Un reranker évalué, puis écarté",
		body: "Un cross-encoder lit la question et le passage ensemble, ce qui aide un premier étage faible. bge-reranker-v2-m3 s'est révélé moins bon juge que Gemini lui-même, pour plusieurs secondes de latence en plus.",
	},
	{
		title: "Une abstention calibrée",
		body: "Le seuil sous lequel le moteur refuse de répondre est appris sur le jeu d'évaluation et validé par leave-one-out, pour ne pas surestimer sa fiabilité.",
	},
	{
		title: "Index exact, pas de base vectorielle",
		body: "Avec quelques centaines de passages, un produit matriciel numpy prend moins d'une milliseconde. Un index approximatif (HNSW) ou une base vectorielle n'apporteraient que de la complexité.",
	},
	{
		title: "Des modèles par API, pas sur la machine",
		body: "Embeddings et génération passent par l'API Gemini ; le reranker de comparaison par Hugging Face. Le serveur ne charge ni PyTorch ni poids de modèle. Si l'API d'embeddings refuse (panne, quota), le moteur se replie sur BM25 et le signale.",
	},
];

export function AboutPage() {
	const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });

	return (
		<div className="space-y-20">
			<div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
				<PageHeader eyebrow="Du TP au produit" title="À propos de Semantica">
					Semantica est la réalisation du premier travail pratique du cours INF5101, Traitement multimédia des données,
					à l'École Nationale Supérieure Polytechnique de Yaoundé. Le sujet demande un petit moteur de recherche
					sémantique ; ce projet le pousse jusqu'à un service déployé, mesuré et documenté.
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
					<p className="eyebrow text-white/60">Le chemin d'une question</p>
					<h2 className="mt-2 text-[clamp(1.6rem,3.6vw,2.4rem)] leading-tight text-white">Architecture</h2>
					<ol className="mt-10 grid gap-4 sm:grid-cols-5">
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

			{stats.data && (
				<section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
					<div>
						<p className="eyebrow">Ce qui tourne en ce moment</p>
						<h2 className="mt-2 text-[clamp(1.6rem,3.6vw,2.4rem)] leading-tight">Modèles en service</h2>
					</div>
					<dl className="rounded-[var(--radius-card)] border border-rule bg-card px-6 py-2 shadow-[var(--shadow-card)]">
						<Row label="Embeddings (recherche, carte)" value={stats.data.encoders[stats.data.default_encoder] ?? ""} />
						<Row label="Embeddings (Cémantix)" value={stats.data.encoders.minilm ?? ""} />
						<Row label="Reranker (comparaison)" value={stats.data.reranker} />
						<Row label="Génération et juge" value={stats.data.llm_enabled ? stats.data.llm_model : "désactivée"} />
						<Row label="Corpus" value={`${stats.data.passages} passages · ${stats.data.documents} documents`} />
						<Row label="Index construit le" value={new Date(stats.data.built_at).toLocaleString("fr-FR")} />
					</dl>
				</section>
			)}

			<section className="flex flex-col items-start gap-6 border-t border-rule pt-10 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="eyebrow">Réalisé par</p>
					<p className="mt-1 font-display text-2xl font-extrabold tracking-tight">{AUTHOR}</p>
					<p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
						Corpus : slides du cours INF5101 (Dr. Aurelle Tchagna, ENSPY) et extraits d'articles Wikipédia en français,
						sous licence CC BY-SA 4.0, chacun lié à sa source.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<Button href={REPOSITORY_URL} variant="outline" size="sm">
						<GithubIcon className="size-4" /> Code source
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

function Row({ label, value }: { readonly label: string; readonly value: string }) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule py-3 last:border-0">
			<dt className="text-sm text-ink-soft">{label}</dt>
			<dd className="font-mono text-[0.75rem] text-ink">{value}</dd>
		</div>
	);
}

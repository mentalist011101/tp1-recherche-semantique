import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { Equal, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api/client.js";
import { ArticleCard } from "../components/ArticleCard.js";
import { Button } from "../components/paper.js";
import { ErrorNotice, LanguageBadge, PageHeader, Spinner } from "../components/ui.js";

import type { ArithmeticResponse, ArithmeticTerm } from "../api/types.js";

// Combinaisons vérifiées sur le corpus : chacune aboutit à un article qui a du sens.
const EXAMPLES: readonly (readonly ArithmeticTerm[])[] = [
	[plus("speech recognition"), minus("audio"), plus("image")],
	[plus("image classification"), minus("image"), plus("sound")],
	[plus("image compression"), minus("image"), plus("audio")],
	[plus("text retrieval"), minus("text"), plus("audio")],
	[plus("video captioning"), minus("video"), plus("audio")],
	[plus("sentence embeddings"), minus("text"), plus("audio")],
	[plus("image segmentation"), plus("language model")],
	[plus("convolutional neural networks"), plus("embedded hardware")],
];

const MAX_TERMS = 4;

export function ArithmeticPage() {
	const [terms, setTerms] = useState<readonly ArithmeticTerm[]>(EXAMPLES[0] ?? []);
	const computed = useMutation({ mutationFn: api.arithmetic });
	const filled = terms.filter((term) => term.text.trim() !== "");

	const run = (next: readonly ArithmeticTerm[]) => {
		setTerms(next);
		computed.mutate(next.map((term) => ({ ...term, text: term.text.trim() })));
	};
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (filled.length >= 2) run(filled);
	};
	const update = (index: number, patch: Partial<ArithmeticTerm>) =>
		setTerms((all) => all.map((term, i) => (i === index ? { ...term, ...patch } : term)));

	return (
		<div className="mx-auto max-w-4xl">
			<PageHeader eyebrow="Jouer avec les vecteurs" title="Arithmétique sémantique">
				Un embedding est un vecteur : on peut l'additionner et le soustraire. Avec les mots, « roi − homme + femme »
				tombe sur « reine ». Ici, on combine des idées et le moteur cherche l'article le plus proche du vecteur
				obtenu : la reconnaissance de la parole, moins l'audio, plus l'image… mène à la reconnaissance de caractères.
			</PageHeader>

			<form onSubmit={submit} className="rounded-[var(--radius-card)] border border-rule bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
				<div className="flex flex-wrap items-center gap-2">
					{terms.map((term, index) => (
						<div key={index} className="flex items-center gap-1.5">
							{index > 0 && (
								<button
									type="button"
									onClick={() => update(index, { sign: term.sign === "+" ? "-" : "+" })}
									aria-label={term.sign === "+" ? "Ajouté : passer en soustraction" : "Soustrait : passer en addition"}
									title="Changer le signe"
									className={clsx(
										"grid size-9 shrink-0 place-items-center rounded-full border transition-colors",
										term.sign === "+" ? "border-moss/40 bg-moss/10 text-moss" : "border-rust/40 bg-rust/10 text-rust",
									)}
								>
									{term.sign === "+" ? <Plus className="size-4" /> : <Minus className="size-4" />}
								</button>
							)}
							<input
								value={term.text}
								onChange={(event) => update(index, { text: event.target.value })}
								placeholder="une idée"
								maxLength={80}
								aria-label={`Terme ${index + 1}`}
								className="h-10 w-44 rounded-[var(--radius-btn)] border border-rule-strong bg-paper px-3 text-[0.9375rem] text-ink outline-none focus:border-ink"
							/>
							{/* Le premier terme reste : l'API exige qu'il soit ajouté, pas soustrait. */}
							{terms.length > 2 && index > 0 && (
								<button
									type="button"
									onClick={() => setTerms((all) => all.filter((_, i) => i !== index))}
									aria-label={`Retirer le terme ${index + 1}`}
									title="Retirer ce terme"
									className="text-ink-faint hover:text-rust"
								>
									<Trash2 className="size-3.5" />
								</button>
							)}
						</div>
					))}
					{terms.length < MAX_TERMS && (
						<button
							type="button"
							onClick={() => setTerms((all) => [...all, plus("")])}
							className="rounded-full border border-dashed border-rule-strong px-3 py-1.5 text-[0.8125rem] text-ink-soft hover:border-ink hover:text-ink"
						>
							+ terme
						</button>
					)}
					<Button type="submit" size="sm" disabled={filled.length < 2 || computed.isPending} className="ml-auto">
						<Equal className="size-4" /> Calculer
					</Button>
				</div>
				<p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-faint">
					Les termes en anglais marchent nettement mieux : en français, quelques articles francophones « aimantent »
					les résultats, c'est le biais de langue mesuré dans l'évaluation.
				</p>
			</form>

			<div className="mt-5 flex flex-wrap gap-2">
				{EXAMPLES.map((example) => (
					<button
						key={formula(example)}
						type="button"
						onClick={() => run(example)}
						className="rounded-full border border-rule-strong px-3 py-1.5 font-mono text-[0.75rem] text-ink-soft transition-colors hover:border-ember hover:text-ink"
					>
						{formula(example)}
					</button>
				))}
			</div>

			<div className="mt-10">
				{computed.isPending && (
					<p className="flex items-center gap-2 text-sm text-ink-soft">
						<Spinner /> Calcul des vecteurs…
					</p>
				)}
				{computed.error && <ErrorNotice error={computed.error} />}
				{computed.data && computed.variables && <Result data={computed.data} terms={computed.variables} />}
			</div>
		</div>
	);
}

function Result({ data, terms }: { readonly data: ArithmeticResponse; readonly terms: readonly ArithmeticTerm[] }) {
	const [best, ...others] = data.results;

	return (
		<section className="space-y-8 animate-fade-in">
			<div>
				<p className="label-mono text-ink-faint">chaque terme, seul</p>
				<ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{data.alone.map((term) => (
						<li key={`${term.sign}${term.text}`} className="rounded-[var(--radius-card)] border border-rule bg-card p-3 text-[0.8125rem]">
							<p className={clsx("font-mono", term.sign === "+" ? "text-moss" : "text-rust")}>
								{term.sign === "+" ? "+" : "−"} {term.text}
							</p>
							<p className="mt-1.5 leading-snug text-ink-soft">
								→ {term.best.article.titre}{" "}
								<span className="font-mono text-[0.6875rem] text-ink-faint">{term.best.score.toFixed(3)}</span>
							</p>
						</li>
					))}
				</ol>
			</div>

			{best && (
				<div>
					<p className="font-display text-xl font-extrabold tracking-tight">
						{formula(terms)} <span className="text-rust">=</span>
					</p>
					<div className="mt-4">
						<ArticleCard article={best.article} score={best.score} section={best.section} excerpt={best.passage} />
					</div>
					{data.excluded && (
						<p className="mt-3 text-[0.8125rem] text-ink-faint">
							Exclu du résultat : « {data.excluded.titre} », l'article de départ, que le premier terme trouvait déjà seul.
						</p>
					)}
				</div>
			)}

			{others.length > 0 && (
				<div>
					<p className="label-mono text-ink-faint">ensuite</p>
					<ol className="mt-3 space-y-2">
						{others.map((hit) => (
							<li key={hit.article.doc_id} className="flex items-baseline gap-3 text-[0.875rem]">
								<span className="font-mono text-[0.6875rem] text-ink-faint">{String(hit.rank).padStart(2, "0")}</span>
								<span className="min-w-0 flex-1 text-ink">{hit.article.titre}</span>
								<LanguageBadge language={hit.article.langue} />
								<span className="font-mono text-[0.6875rem] text-ink-faint">{hit.score.toFixed(3)}</span>
							</li>
						))}
					</ol>
				</div>
			)}

			<p className="border-l-2 border-rule-strong pl-3 font-editorial text-[1rem] leading-snug text-ink-soft italic">
				Le calcul ne peut pas inventer d'article : si l'idée visée n'existe pas dans le corpus (des visages, de la
				musique), il renvoie seulement ce qui s'en approche le plus.
			</p>
		</section>
	);
}

function formula(terms: readonly ArithmeticTerm[]): string {
	return terms.map((term, index) => (index === 0 ? term.text : `${term.sign === "+" ? "+" : "−"} ${term.text}`)).join(" ");
}

function plus(text: string): ArithmeticTerm {
	return { sign: "+", text };
}

function minus(text: string): ArithmeticTerm {
	return { sign: "-", text };
}

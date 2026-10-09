import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, Check, Search, X } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client.js";
import type { Modality } from "../api/types.js";
import { Button, Tape, ThinkingDots } from "../components/paper.js";
import { SlideViewer } from "../components/SlideViewer.js";
import { ErrorNotice, ModalityBadge, PageHeader } from "../components/ui.js";
import { MODALITY_LABEL } from "../lib/labels.js";

const TOPICS: readonly (Modality | undefined)[] = [undefined, "texte", "image", "audio", "video"];

export function QuizPage() {
	const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
	const [topic, setTopic] = useState<Modality | undefined>();
	const [choice, setChoice] = useState<number | undefined>();
	const [score, setScore] = useState({ correct: 0, total: 0 });
	const [viewing, setViewing] = useState(false);

	const quiz = useMutation({ mutationFn: api.quiz, onMutate: () => setChoice(undefined) });
	const item = quiz.data;
	const answered = choice !== undefined;

	const answer = (index: number) => {
		if (!item || answered) return;
		setChoice(index);
		setScore((s) => ({ correct: s.correct + (index === item.answer ? 1 : 0), total: s.total + 1 }));
	};

	return (
		<div className="mx-auto max-w-3xl">
			<PageHeader eyebrow="Réviser avec le cours" title="Une slide, une question">
				Le LLM lit une slide du cours tirée au hasard et en tire une question de compréhension avec des distracteurs
				plausibles. En cas d'erreur, la slide source est à un clic, et le moteur de recherche peut prolonger la
				révision.
			</PageHeader>

			{stats.data && !stats.data.llm_enabled && (
				<div className="mb-6">
					<ErrorNotice error={new Error("La génération est désactivée : aucune clé Gemini n'est configurée sur ce serveur.")} />
				</div>
			)}

			<div className="mb-8 flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
				{TOPICS.map((t) => (
					<button
						key={t ?? "all"}
						type="button"
						onClick={() => setTopic(t)}
						className={clsx(
							"rounded-full px-3.5 py-2 transition-colors",
							topic === t ? "bg-ink text-paper" : "border border-rule text-ink-soft hover:text-ink",
						)}
					>
						{t ? MODALITY_LABEL[t] : "Tout le cours"}
					</button>
				))}
				<span className="ml-auto rounded-full bg-sun px-3 py-1.5 font-mono text-[0.75rem] leading-none text-[#16181d]">
					{score.correct} / {score.total}
				</span>
			</div>

			{!item && !quiz.isPending && (
				<Button onClick={() => quiz.mutate(topic)} disabled={!stats.data?.llm_enabled}>
					Tirer une question
					<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
				</Button>
			)}
			{quiz.isPending && (
				<div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-rule bg-card p-6 text-sm text-ink-soft shadow-[var(--shadow-card)]">
					<ThinkingDots label="Génération en cours" /> Le modèle lit une slide et rédige une question…
				</div>
			)}
			{quiz.error && <ErrorNotice error={quiz.error} />}

			{item && !quiz.isPending && (
				<article className="relative animate-fade-in rounded-[var(--radius-card)] border border-rule bg-card p-6 shadow-[var(--shadow-lift)] sm:p-8">
					<Tape className="-top-3 right-10 w-20 rotate-[3deg]" />
					<div className="flex flex-wrap items-center gap-2">
						<ModalityBadge modality={item.source.modality} />
						<span className="font-editorial text-[1rem] text-ink-soft italic">
							d'après la slide {item.source.page}, {item.source.title}
						</span>
					</div>
					<h2 className="mt-4 text-[1.5rem] leading-tight">{item.question}</h2>

					<div className="mt-6 space-y-2.5">
						{item.choices.map((text, index) => {
							const correct = index === item.answer;
							const picked = index === choice;
							return (
								<button
									key={text}
									type="button"
									onClick={() => answer(index)}
									disabled={answered}
									className={clsx(
										"flex w-full items-center gap-4 rounded-[var(--radius-btn)] border p-4 text-left text-[0.9375rem] transition-all",
										!answered &&
											"border-rule-strong bg-card shadow-[var(--shadow-hard)] hover:translate-x-[2px] hover:translate-y-[2px] hover:border-ink hover:shadow-[var(--shadow-hard-sm)]",
										answered && correct && "border-moss bg-moss/10",
										answered && picked && !correct && "border-rust bg-rust/10",
										answered && !correct && !picked && "border-rule opacity-55",
									)}
								>
									<span
										className={clsx(
											"grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs",
											answered && correct ? "bg-moss text-white" : answered && picked ? "bg-rust text-white" : "border border-rule-strong text-ink-soft",
										)}
									>
										{answered && correct ? <Check className="size-4" /> : answered && picked ? <X className="size-4" /> : String.fromCharCode(65 + index)}
									</span>
									{text}
								</button>
							);
						})}
					</div>

					{answered && (
						<div className="mt-6 animate-fade-in border-t border-rule pt-5">
							<p className="label-mono text-rust">{choice === item.answer ? "bonne réponse" : "pas tout à fait"}</p>
							<p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{item.explanation}</p>
							<div className="mt-5 flex flex-wrap gap-3">
								<Button variant="outline" size="sm" onClick={() => setViewing(true)}>
									Revoir la slide {item.source.page}
								</Button>
								<Button variant="ghost" size="sm" to={`/?q=${encodeURIComponent(item.question)}`}>
									<Search className="size-3.5" /> Approfondir avec le moteur
								</Button>
								<Button size="sm" className="ml-auto" onClick={() => quiz.mutate(topic)}>
									Question suivante
									<ArrowRight className="size-4" />
								</Button>
							</div>
						</div>
					)}
				</article>
			)}

			{viewing && item?.source.page !== undefined && (
				<SlideViewer page={item.source.page} title={item.source.title} onClose={() => setViewing(false)} />
			)}
		</div>
	);
}

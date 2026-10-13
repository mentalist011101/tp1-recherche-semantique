import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { useSearchParams } from "react-router";

import { api, chat } from "../api/client.js";
import type { ChatSource } from "../api/types.js";
import { ThinkingDots } from "../components/paper.js";
import { SearchBar } from "../components/SearchBar.js";
import { ErrorNotice, LanguageBadge, PageHeader } from "../components/ui.js";

const EXAMPLES = [
	"Quelle est la différence entre le tatouage numérique et la stéganographie ?",
	"Les coefficients MFCC contiennent-ils une information sur la prosodie ?",
	"Comment rendre un réseau de neurones embarqué robuste aux fautes matérielles ?",
	"How does SimCSE use dropout to build positive pairs?",
];

type Status = "searching" | "writing" | "done" | "abstained" | "error";

interface Exchange {
	readonly id: number;
	readonly question: string;
	readonly status: Status;
	readonly answer: string;
	readonly sources: readonly ChatSource[];
	readonly error: unknown;
}

export function ChatPage() {
	const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
	const [exchanges, setExchanges] = useState<readonly Exchange[]>([]);
	const controller = useRef<AbortController | undefined>(undefined);
	const busy = exchanges.some((e) => e.status === "searching" || e.status === "writing");

	const [params, setParams] = useSearchParams();
	const incoming = params.get("q");
	const handled = useRef<string | undefined>(undefined);

	useEffect(() => () => controller.current?.abort(), []);

	const ask = async (question: string) => {
		const id = Date.now();
		const update = (patch: Partial<Exchange>) =>
			setExchanges((all) => all.map((e) => (e.id === id ? { ...e, ...patch } : e)));
		setExchanges((all) => [...all, { id, question, status: "searching", answer: "", sources: [], error: undefined }]);
		controller.current = new AbortController();

		let answer = "";
		try {
			for await (const event of chat(question, controller.current.signal)) {
				if (event.type === "sources") {
					update({ sources: event.passages, status: event.abstained ? "abstained" : "writing" });
				} else if (event.type === "token") {
					answer += event.text;
					update({ answer });
				} else if (event.type === "error") {
					update({ status: "error", error: new Error(event.message) });
					return;
				} else {
					setExchanges((all) => all.map((e) => (e.id === id && e.status === "writing" ? { ...e, status: "done" } : e)));
				}
			}
		} catch (error) {
			if (!controller.current.signal.aborted) update({ status: "error", error });
		}
	};

	// Une question arrivée depuis la page de recherche (/chat?q=…) est posée une seule fois.
	useEffect(() => {
		if (!incoming || handled.current === incoming) return;
		handled.current = incoming;
		setParams({}, { replace: true });
		void ask(incoming);
	});

	return (
		<div className="mx-auto max-w-4xl">
			<PageHeader eyebrow="Génération augmentée" title="Poser une question aux articles">
				La réponse est rédigée par {stats.data?.settings.llm_model ?? "Gemini Flash"} à partir des seuls passages
				retrouvés dans le corpus, et cite ses sources. Si aucun article ne traite le sujet, le modèle n'est pas
				interrogé. Chaque question est indépendante des précédentes.
			</PageHeader>

			<div className="space-y-10">
				{exchanges.map((exchange) => (
					<ExchangeView key={exchange.id} exchange={exchange} />
				))}
			</div>

			<div className={clsx(exchanges.length > 0 && "mt-10 border-t border-rule pt-8")}>
				<SearchBar initial="" onSubmit={ask} busy={busy} placeholder="Votre question sur le traitement multimédia" />
				{exchanges.length === 0 && (
					<div className="mt-5 flex flex-wrap gap-2">
						{EXAMPLES.map((example) => (
							<button
								key={example}
								type="button"
								onClick={() => ask(example)}
								className="rounded-full border border-rule-strong px-3 py-1.5 text-[0.75rem] text-ink-soft transition-colors hover:border-ember hover:text-ink"
							>
								{example}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function ExchangeView({ exchange }: { readonly exchange: Exchange }) {
	const cited = new Set([...exchange.answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));

	return (
		<article className="animate-fade-in">
			<p className="ml-auto max-w-[85%] rounded-[var(--radius-card)] bg-ink px-4 py-3 text-[0.9375rem] text-paper">
				{exchange.question}
			</p>

			<div className="mt-4 rounded-[var(--radius-card)] border border-rule bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
				{exchange.status === "searching" && (
					<p className="flex items-center gap-2 text-sm text-ink-soft">
						<ThinkingDots label="Recherche" /> Recherche des passages…
					</p>
				)}
				{exchange.status === "abstained" && (
					<div className="sticky-note -rotate-[0.4deg] rounded-[var(--radius-card)] border border-kraft-deep/30 bg-kraft/60 p-4 text-sm text-[#16181d]">
						<p className="label-mono text-[#16181d]/50">confiance sous le seuil</p>
						<p className="mt-1.5">
							Aucun article de ce corpus ne semble traiter ce sujet : le modèle n'a pas été interrogé, pour ne pas
							produire une réponse sans source.
						</p>
					</div>
				)}
				{exchange.status === "writing" && exchange.answer === "" && (
					<p className="flex items-center gap-2 text-sm text-ink-soft">
						<ThinkingDots label="Rédaction" /> Rédaction de la réponse…
					</p>
				)}
				{exchange.answer !== "" && (
					<div className="answer text-[0.9375rem] leading-relaxed text-ink">
						<Markdown
							components={{
								a: ({ href, children }) => (
									<a href={href} className="citation">
										{children}
									</a>
								),
							}}
						>
							{withCitationLinks(exchange.answer, exchange.id)}
						</Markdown>
					</div>
				)}
				{exchange.status === "error" && <ErrorNotice error={exchange.error} />}

				{exchange.sources.length > 0 && exchange.status !== "abstained" && (
					<ol className="mt-5 space-y-2 border-t border-rule pt-4">
						{exchange.sources.map((source) => (
							<SourceLine key={source.number} id={exchange.id} source={source} cited={cited.has(source.number)} />
						))}
					</ol>
				)}
			</div>
		</article>
	);
}

function SourceLine({
	id,
	source,
	cited,
}: {
	readonly id: number;
	readonly source: ChatSource;
	readonly cited: boolean;
}) {
	return (
		<li
			id={`source-${id}-${source.number}`}
			className={clsx("flex items-baseline gap-3 text-[0.8125rem]", !cited && "opacity-55")}
			title={source.passage}
		>
			<span className={clsx("shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.6875rem]", cited ? "bg-sun text-[#16181d]" : "bg-ink/5 text-ink-soft")}>
				[{source.number}]
			</span>
			<span className="min-w-0 flex-1">
				<span className="font-medium text-ink">{source.article.titre}</span>
				<span className="text-ink-soft"> · {source.section}</span>
			</span>
			<LanguageBadge language={source.article.langue} />
			<span className="font-mono text-[0.6875rem] text-ink-faint">{source.score.toFixed(3)}</span>
			<a
				href={source.article.url}
				target="_blank"
				rel="noreferrer noopener"
				aria-label={`Lire l'article ${source.article.titre}`}
				className="text-ink-soft hover:text-rust"
			>
				<ArrowUpRight className="size-3.5" />
			</a>
		</li>
	);
}

// Les citations « [2] » deviennent des liens vers la source correspondante, sous la réponse.
function withCitationLinks(answer: string, id: number): string {
	return answer.replace(/\[(\d+)\]/g, (_, number: string) => `[[${number}]](#source-${id}-${number})`);
}

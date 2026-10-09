import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Flag, Lightbulb, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api/client.js";
import type { Game, Guess, Reveal } from "../api/types.js";
import { Button, Tape } from "../components/paper.js";
import { ErrorNotice, PageHeader, Spinner } from "../components/ui.js";

interface SavedGame {
	readonly guesses: readonly Guess[];
	readonly hints: readonly { readonly word: string; readonly rank: number }[];
	readonly reveal: Reveal | undefined;
}

const EMPTY_GAME: SavedGame = { guesses: [], hints: [], reveal: undefined };

export function CemantixPage() {
	const daily = useQuery({ queryKey: ["cemantix-daily"], queryFn: api.dailyGame });
	const [game, setGame] = useState<Game | undefined>();
	const current = game ?? daily.data;

	return (
		<div className="mx-auto max-w-4xl">
			<PageHeader eyebrow="Un jeu pour sentir la similarité" title="Le Cémantix du cours">
				Proposez des mots : le jeu répond par une température qui mesure leur proximité de sens avec un mot secret du
				cours, calculée par similarité cosinus entre embeddings. Aucune lettre commune n'est nécessaire, seul le sens
				compte.
			</PageHeader>

			{daily.error && <ErrorNotice error={daily.error} />}
			{current ? <Board key={current.game} game={current} onNewGame={setGame} /> : <Spinner />}

			<div className="mt-16 grid gap-5 sm:grid-cols-3">
				<Explainer title="Température" tone="bg-sun" rotation="-rotate-[1.4deg]">
					Le cosinus ramené sur une échelle lisible : 0 °C pour la similarité médiane du vocabulaire avec le mot
					secret, 100 °C pour son plus proche voisin.
				</Explainer>
				<Explainer title="Progression ‰" tone="bg-kraft/70" rotation="rotate-[1deg]">
					Si votre mot fait partie des 1 000 mots du corpus les plus proches du secret, sa position s'affiche : 999 ‰
					signifie que c'est le voisin le plus proche.
				</Explainer>
				<Explainer title="Le modèle" tone="bg-card border border-rule" rotation="-rotate-[0.6deg]">
					Embeddings de paraphrase-multilingual-MiniLM, plus fidèles au sens des mots isolés que les modèles de
					recherche. Les mots hors vocabulaire sont encodés à la volée.
				</Explainer>
			</div>
		</div>
	);
}

function Board({ game, onNewGame }: { readonly game: Game; readonly onNewGame: (game: Game) => void }) {
	const [storageKey] = useState(() => `cemantix:${game.daily ? new Date().toISOString().slice(0, 10) : "free"}:${game.game}`);
	const [saved, setSaved] = useState<SavedGame>(() => load(storageKey));
	const [word, setWord] = useState("");
	const [last, setLast] = useState<string | undefined>();

	useEffect(() => store(storageKey, saved), [storageKey, saved]);

	const found = saved.guesses.some((g) => g.found);
	const finished = found || saved.reveal !== undefined;
	const bestRank = Math.min(...saved.guesses.map((g) => g.rank ?? Infinity), ...saved.hints.map((h) => h.rank));

	const guess = useMutation({
		mutationFn: (value: string) => api.guess(game.game, value),
		onSuccess: (result) => {
			setLast(result.word);
			setSaved((s) => (s.guesses.some((g) => g.word === result.word) ? s : { ...s, guesses: [...s.guesses, result] }));
		},
	});
	const hint = useMutation({
		mutationFn: () => api.hint(game.game, Number.isFinite(bestRank) ? bestRank : undefined),
		onSuccess: (result) => setSaved((s) => ({ ...s, hints: [...s.hints, result] })),
	});
	const reveal = useMutation({
		mutationFn: () => api.reveal(game.game),
		onSuccess: (result) => setSaved((s) => ({ ...s, reveal: result })),
	});
	const fresh = useMutation({ mutationFn: () => api.newGame(game.game), onSuccess: onNewGame });

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const value = word.trim().toLowerCase();
		if (!value) return;
		guess.mutate(value);
		setWord("");
	};

	const sorted = [...saved.guesses].sort((a, b) => b.temperature - a.temperature);
	const latest = saved.guesses.find((g) => g.word === last);

	return (
		<div className="relative rounded-[var(--radius-card)] border border-rule bg-card p-6 shadow-[var(--shadow-lift)] sm:p-8">
			<Tape className="-top-3 left-10 w-24" label={game.daily ? `mot du jour · n°${game.game + 1}` : `partie libre · n°${game.game + 1}`} />

			<div className="mb-6 flex flex-wrap items-center gap-2">
				<span className="label-mono text-ink-faint">{saved.guesses.length} essais</span>
				<div className="ml-auto flex flex-wrap gap-1">
					<Button variant="ghost" size="sm" disabled={finished || hint.isPending} onClick={() => hint.mutate()}>
						<Lightbulb className="size-3.5" /> Indice
					</Button>
					<Button variant="ghost" size="sm" disabled={finished || reveal.isPending} onClick={() => reveal.mutate()}>
						<Flag className="size-3.5" /> Abandonner
					</Button>
					<Button variant="outline" size="sm" disabled={fresh.isPending} onClick={() => fresh.mutate()}>
						<RefreshCw className="size-3.5" /> Nouvelle partie
					</Button>
				</div>
			</div>

			{finished ? (
				<Finish
					found={found}
					tries={saved.guesses.length}
					reveal={saved.reveal}
					secret={saved.guesses.find((g) => g.found)?.word}
					gameId={game.game}
				/>
			) : (
				<form onSubmit={submit} className="flex gap-3">
					<input
						value={word}
						onChange={(event) => setWord(event.target.value)}
						placeholder="Un mot…"
						className="field h-12 text-base"
						autoFocus
						maxLength={40}
						aria-label="Votre proposition"
					/>
					<Button type="submit" disabled={guess.isPending || !word.trim()} className="h-12">
						{guess.isPending ? <Spinner /> : "Tenter"}
					</Button>
				</form>
			)}
			{guess.error && (
				<div className="mt-4">
					<ErrorNotice error={guess.error} />
				</div>
			)}

			{saved.hints.length > 0 && (
				<div className="mt-5 flex flex-wrap gap-2">
					{saved.hints.map((h) => (
						<span key={h.word} className="rounded-full bg-sun px-3 py-1.5 font-mono text-[0.6875rem] leading-none text-[#16181d]">
							indice · « {h.word} » à {1000 - h.rank + 1} ‰
						</span>
					))}
				</div>
			)}

			{latest && !finished && (
				<div className="mt-6">
					<GuessRow guess={latest} highlight />
				</div>
			)}

			{sorted.length > 0 && (
				<div className="mt-6 border-t border-rule pt-5">
					<div className="label-mono mb-2 grid grid-cols-[1fr_80px_140px] gap-3 px-3 text-ink-faint">
						<span>Mot</span>
						<span className="text-right">°C</span>
						<span>Progression</span>
					</div>
					<div>
						{sorted.map((g) => (
							<GuessRow key={g.word} guess={g} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function GuessRow({ guess, highlight = false }: { readonly guess: Guess; readonly highlight?: boolean }) {
	const permille = guess.found ? 1000 : guess.rank ? 1000 - guess.rank + 1 : undefined;
	return (
		<div
			className={clsx(
				"grid grid-cols-[1fr_80px_140px] items-center gap-3 px-3 py-2.5 text-sm",
				highlight ? "rounded-[var(--radius-card)] border border-ember/45 bg-ember/10" : "border-b border-rule last:border-0",
			)}
		>
			<span className="font-display font-bold tracking-tight text-ink">
				{guess.word}
				{!guess.known && (
					<span className="ml-2 font-mono text-[0.625rem] font-normal text-ink-faint" title="Mot absent du corpus, encodé à la volée">
						hors corpus
					</span>
				)}
			</span>
			<span className="text-right font-mono font-semibold" style={{ color: temperatureColor(guess.temperature) }}>
				{guess.temperature.toFixed(2)}
			</span>
			<span className="flex items-center gap-2">
				{permille !== undefined ? (
					<>
						<span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
							<span className="block h-full rounded-full bg-gradient-to-r from-sun to-ember" style={{ width: `${permille / 10}%` }} />
						</span>
						<span className="w-9 text-right font-mono text-xs text-ink-soft">{permille}</span>
					</>
				) : (
					<span className="font-editorial text-ink-faint italic">froid</span>
				)}
			</span>
		</div>
	);
}

function Finish({
	found,
	tries,
	reveal,
	secret,
	gameId,
}: {
	readonly found: boolean;
	readonly tries: number;
	readonly reveal: Reveal | undefined;
	readonly secret: string | undefined;
	readonly gameId: number;
}) {
	const neighbours = useQuery({
		queryKey: ["cemantix-reveal", gameId],
		queryFn: () => api.reveal(gameId),
		enabled: found && !reveal,
	});
	const data = reveal ?? neighbours.data;
	return (
		<div className="rounded-[var(--radius-card)] bg-night p-6 text-white shadow-[var(--shadow-lift)]">
			<p className="label-mono text-sun/70">{found ? "trouvé" : "partie abandonnée"}</p>
			<p className="mt-2 font-display text-2xl font-extrabold tracking-tight">
				{found ? `En ${tries} essais.` : "Le mot vous a échappé."}
			</p>
			<p className="mt-1 text-white/70">
				Le mot secret était <span className="font-semibold text-sun">« {data?.secret ?? secret} »</span>.
			</p>
			{data && (
				<div className="mt-5 border-t border-white/10 pt-4">
					<p className="font-mono text-[0.625rem] tracking-[0.12em] text-white/45 uppercase">
						ses plus proches voisins dans l'espace d'embeddings
					</p>
					<div className="mt-3 flex flex-wrap gap-1.5">
						{data.neighbours.map(([w, s]) => (
							<span key={w} className="rounded-full border border-white/20 px-3 py-1.5 text-[0.75rem] text-white/80">
								{w} <span className="font-mono text-white/40">{s.toFixed(2)}</span>
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function Explainer({
	title,
	tone,
	rotation,
	children,
}: {
	readonly title: string;
	readonly tone: string;
	readonly rotation: string;
	readonly children: string;
}) {
	return (
		<div
			className={clsx(
				"sticky-note rounded-[var(--radius-card)] p-5 transition-transform hover:rotate-0",
				tone,
				rotation,
				tone.includes("bg-card") ? "text-ink" : "text-[#16181d]",
			)}
		>
			<p className="label-mono opacity-55">{title}</p>
			<p className="mt-2 text-[0.875rem] leading-relaxed opacity-85">{children}</p>
		</div>
	);
}

function temperatureColor(temperature: number): string {
	if (temperature >= 50) return "#b4400f";
	if (temperature >= 25) return "#e0661c";
	if (temperature >= 0) return "#a07a10";
	return "#0f62ce";
}

function load(key: string): SavedGame {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as SavedGame) : EMPTY_GAME;
	} catch {
		return EMPTY_GAME;
	}
}

function store(key: string, game: SavedGame) {
	try {
		localStorage.setItem(key, JSON.stringify(game));
	} catch {
		// Stockage indisponible : la partie reste jouable, elle ne sera simplement pas reprise.
	}
}

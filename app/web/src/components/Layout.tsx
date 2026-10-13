import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

import { api } from "../api/client.js";
import { AUTHOR, PORTFOLIO_URL, REPOSITORY_URL } from "../lib/links.js";
import { NodeMark } from "./paper.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { GithubIcon } from "./ui.js";

const NAVIGATION = [
	{ to: "/", label: "Recherche" },
	{ to: "/chat", label: "Chat" },
	{ to: "/corpus", label: "Corpus" },
	{ to: "/a-propos", label: "À propos" },
] as const;

export function Layout() {
	const [scrolled, setScrolled] = useState(false);
	const [progress, setProgress] = useState(0);
	const [open, setOpen] = useState(false);
	const location = useLocation();

	useEffect(() => {
		const onScroll = () => {
			const max = document.documentElement.scrollHeight - window.innerHeight;
			setScrolled(window.scrollY > 10);
			setProgress(max > 0 ? Math.min(window.scrollY / max, 1) : 0);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		window.scrollTo({ top: 0 });
	}, [location.pathname]);

	return (
		<div className="flex min-h-dvh flex-col bg-paper paper-grain">
			<header
				className={clsx(
					"fixed inset-x-0 top-0 z-50 transition-all duration-300",
					scrolled || open ? "border-b border-rule bg-paper/90 backdrop-blur-md" : "border-b border-transparent",
				)}
			>
				<div
					aria-hidden
					className="absolute inset-x-0 top-0 h-0.5 origin-left bg-ember transition-transform duration-150 ease-linear"
					style={{ transform: `scaleX(${progress})` }}
				/>
				<div className="shell flex items-center justify-between gap-4 py-3">
					<NavLink to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
						<span className="grid h-9 w-9 place-items-center rounded-[5px] bg-ink shadow-[var(--shadow-card)]">
							<NodeMark className="text-[1.15rem] text-paper" />
						</span>
						<span className="flex flex-col leading-none">
							<span className="font-display text-[0.95rem] font-extrabold tracking-tight">Semantica</span>
							<span className="label-mono mt-1 text-ink-faint">INF5101 · TP 1</span>
						</span>
					</NavLink>

					<nav aria-label="Pages" className="hidden lg:block">
						<ul className="flex items-center gap-1">
							{NAVIGATION.map((item) => (
								<li key={item.to}>
									<NavLink
										to={item.to}
										end={item.to === "/"}
										className={({ isActive }) =>
											clsx(
												"rounded-full px-3.5 py-2 text-[0.8125rem] transition-colors duration-200",
												isActive ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
											)
										}
									>
										{item.label}
									</NavLink>
								</li>
							))}
						</ul>
					</nav>

					<div className="flex items-center gap-1.5">
						<ThemeToggle className="hidden sm:grid" />
						<a
							href={REPOSITORY_URL}
							target="_blank"
							rel="noreferrer noopener"
							aria-label="Code source sur GitHub"
							className="hidden h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink sm:grid"
						>
							<GithubIcon className="size-[1.05rem]" />
						</a>
						<button
							type="button"
							onClick={() => setOpen((value) => !value)}
							aria-expanded={open}
							aria-controls="mobile-navigation"
							aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
							className="grid h-10 w-10 place-items-center rounded-[6px] border border-rule-strong bg-card text-ink lg:hidden"
						>
							{open ? <X className="size-[1.15rem]" /> : <Menu className="size-[1.15rem]" />}
						</button>
					</div>
				</div>

				<div
					id="mobile-navigation"
					hidden={!open}
					className="fixed inset-x-0 top-[62px] bottom-0 z-40 overflow-y-auto border-t border-rule bg-paper paper-grain lg:hidden"
				>
					<nav aria-label="Pages" className="shell flex flex-col py-6">
						<div className="flex items-center justify-between border-b border-rule pb-4">
							<span className="label-mono text-ink-faint">Thème</span>
							<ThemeToggle className="border border-rule-strong bg-card" />
						</div>
						{NAVIGATION.map((item, index) => (
							<NavLink
								key={item.to}
								to={item.to}
								end={item.to === "/"}
								onClick={() => setOpen(false)}
								className="flex items-baseline gap-4 border-b border-rule py-4 font-display text-2xl font-extrabold tracking-tight text-ink"
							>
								<span className="label-mono text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
								{item.label}
							</NavLink>
						))}
					</nav>
				</div>
			</header>

			<main className="shell flex-1 pt-28 pb-20 sm:pt-32">
				<Outlet />
			</main>

			<Footer />
		</div>
	);
}

const ELSEWHERE = [
	{ kind: "code", label: "Dépôt GitHub", href: REPOSITORY_URL, tone: "bg-sun", rotation: "-rotate-[2deg]" },
	{ kind: "auteur", label: "Portfolio", href: PORTFOLIO_URL, tone: "bg-card border border-rule", rotation: "rotate-[1.5deg]" },
	{ kind: "api", label: "Documentation API", href: "/api/docs", tone: "bg-kraft/70", rotation: "rotate-[2deg]" },
	{ kind: "méthode", label: "Notebook", href: `${REPOSITORY_URL}/blob/main/notebooks/recherche_semantique.ipynb`, tone: "bg-card border border-rule", rotation: "-rotate-[1.2deg]" },
] as const;

function Footer() {
	const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });

	return (
		<footer className="relative border-t border-rule bg-paper paper-grain">
			<div aria-hidden className="absolute top-0 right-0 hidden h-full w-2 bg-ember lg:block" />
			<div className="shell grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
				<div>
					<div className="flex items-center gap-2.5">
						<span className="grid h-9 w-9 place-items-center rounded-[5px] bg-ink shadow-[var(--shadow-card)]">
							<NodeMark className="text-[1.15rem] text-paper" />
						</span>
						<span className="font-display text-lg font-extrabold tracking-tight">Semantica</span>
					</div>
					<p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
						Travail pratique 1 du cours INF5101, Traitement multimédia des données : un moteur de recherche
						sémantique pour trouver quels articles lire. École Nationale Supérieure Polytechnique de Yaoundé.
					</p>
					<p className="mt-3 font-editorial text-[1.0625rem] text-ink-soft italic">par {AUTHOR}</p>
				</div>

				<div>
					<h2 className="label-mono text-ink-faint">Index</h2>
					{stats.data ? (
						<dl className="mt-4 space-y-2.5 text-sm">
							<Stat label="Articles" value={String(stats.data.articles)} />
							<Stat label="Passages" value={String(stats.data.settings.passages)} />
							<Stat label="Embeddings" value={stats.data.settings.embedding_model} />
							<Stat label="Base vectorielle" value={`Pinecone · ${stats.data.settings.index}`} />
							<Stat label="Génération" value={stats.data.settings.llm_model} />
						</dl>
					) : (
						<p className="mt-4 text-sm text-ink-faint">…</p>
					)}
				</div>

				<div>
					<h2 className="label-mono text-ink-faint">Ailleurs</h2>
					<ul className="mt-5 grid grid-cols-2 gap-3">
						{ELSEWHERE.map((note) => (
							<li key={note.label}>
								<a
									href={note.href}
									target="_blank"
									rel="noreferrer noopener"
									className={clsx(
										"sticky-note flex h-24 flex-col justify-between p-3 transition-transform duration-300 hover:-translate-y-1 hover:rotate-0",
										note.tone,
										note.rotation,
										note.tone.includes("bg-card") ? "text-ink" : "text-[#16181d]",
									)}
								>
									<span className="label-mono opacity-50">{note.kind}</span>
									<span className="font-display text-sm font-bold tracking-tight">{note.label}</span>
								</a>
							</li>
						))}
					</ul>
				</div>
			</div>
			<div className="border-t border-rule">
				<div className="shell flex flex-col gap-3 py-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
					<p>Corpus : 50 articles en accès libre sur arXiv et HAL, consultables chez leurs auteurs.</p>
					<p className="font-mono">LangChain · Pinecone · Groq · FastAPI · React</p>
				</div>
			</div>
		</footer>
	);
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
			<dt className="text-ink-soft">{label}</dt>
			<dd className="truncate font-mono text-[0.75rem] text-ink">{value}</dd>
		</div>
	);
}

import clsx from "clsx";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import type { Language, Modality } from "../api/types.js";
import { MODALITY_COLOR, MODALITY_LABEL } from "../lib/labels.js";
import { SectionHeader } from "./paper.js";

export function ModalityBadge({ modality }: { readonly modality: Modality }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-1 font-mono text-[0.6875rem] leading-none text-ink-soft">
			<span className="size-1.5 rounded-full" style={{ backgroundColor: MODALITY_COLOR[modality] }} />
			{MODALITY_LABEL[modality]}
		</span>
	);
}

export function LanguageBadge({ language }: { readonly language: Language }) {
	return (
		<span
			className={clsx(
				"rounded-full border px-2.5 py-1 font-mono text-[0.625rem] leading-none tracking-[0.12em] uppercase",
				language === "fr" ? "border-ember/45 bg-ember/10 text-rust" : "border-azure/35 bg-azure/10 text-azure",
			)}
		>
			{language}
		</span>
	);
}

export function PageHeader({
	eyebrow,
	title,
	children,
	action,
}: {
	readonly eyebrow: string;
	readonly title: ReactNode;
	readonly children?: ReactNode;
	readonly action?: ReactNode;
}) {
	return <SectionHeader as="h1" eyebrow={eyebrow} title={title} description={children} action={action} className="mb-12" />;
}

export function Spinner({ className }: { readonly className?: string }) {
	return <Loader2 className={clsx("size-4 animate-spin", className)} aria-label="Chargement" />;
}

export function ErrorNotice({ error }: { readonly error: unknown }) {
	const message = error instanceof Error ? error.message : "Erreur inattendue";
	return (
		<div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-rust/40 bg-rust/[0.06] p-4 text-sm text-rust-deep dark:text-ember">
			<AlertTriangle className="mt-0.5 size-4 shrink-0" />
			<span>{message}</span>
		</div>
	);
}

export function FilterChip({
	active,
	onClick,
	children,
}: {
	readonly active: boolean;
	readonly onClick: () => void;
	readonly children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={clsx(
				"rounded-full px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200",
				active ? "bg-ink text-paper" : "border border-rule text-ink-soft hover:bg-ink/5 hover:text-ink",
			)}
		>
			{children}
		</button>
	);
}

export function GithubIcon({ className }: { readonly className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
			<path d="M12 1.6a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-1.8c-2.92.64-3.54-1.4-3.54-1.4-.48-1.23-1.17-1.55-1.17-1.55-.96-.66.07-.64.07-.64 1.06.07 1.61 1.1 1.61 1.1.94 1.62 2.47 1.15 3.07.88.1-.69.37-1.15.67-1.42-2.33-.27-4.78-1.18-4.78-5.24 0-1.16.4-2.1 1.07-2.84-.11-.27-.47-1.35.1-2.81 0 0 .88-.29 2.88 1.08a9.9 9.9 0 0 1 5.24 0c2-1.37 2.88-1.08 2.88-1.08.57 1.46.21 2.54.1 2.81.67.74 1.07 1.68 1.07 2.84 0 4.07-2.46 4.96-4.8 5.23.38.33.72.97.72 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.6Z" />
		</svg>
	);
}

import clsx from "clsx";
import type { ReactNode } from "react";
import { Link } from "react-router";

type ButtonVariant = "primary" | "outline" | "light" | "ghost";
type ButtonSize = "sm" | "md";

interface ButtonProps {
	readonly children: ReactNode;
	readonly to?: string;
	readonly href?: string;
	readonly variant?: ButtonVariant;
	readonly size?: ButtonSize;
	readonly className?: string;
	readonly onClick?: () => void;
	readonly type?: "button" | "submit";
	readonly disabled?: boolean;
	readonly title?: string;
	readonly ariaLabel?: string;
}

export function Button({
	children,
	to,
	href,
	variant = "primary",
	size = "md",
	className,
	onClick,
	type = "button",
	disabled = false,
	title,
	ariaLabel,
}: ButtonProps) {
	const classes = clsx(
		"group inline-flex items-center justify-center gap-2 rounded-[var(--radius-btn)] font-medium transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50",
		size === "sm" ? "px-3.5 py-2 text-[0.8125rem]" : "px-5 py-3 text-sm",
		variant !== "ghost" &&
			// Ombre pleine décalée qui s'écrase quand le bouton est enfoncé, comme sur le portfolio.
			"hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
		VARIANTS[variant],
		className,
	);

	if (to !== undefined) {
		return (
			<Link to={to} className={classes} title={title} aria-label={ariaLabel}>
				{children}
			</Link>
		);
	}
	if (href !== undefined) {
		return (
			<a href={href} className={classes} target="_blank" rel="noreferrer noopener" title={title} aria-label={ariaLabel}>
				{children}
			</a>
		);
	}
	return (
		<button type={type} onClick={onClick} className={classes} disabled={disabled} title={title} aria-label={ariaLabel}>
			{children}
		</button>
	);
}

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
	primary: "bg-ember text-white shadow-[var(--shadow-hard)] hover:bg-rust hover:shadow-[var(--shadow-hard-sm)]",
	outline:
		"border border-rule-strong bg-card text-ink shadow-[var(--shadow-hard)] hover:border-ink hover:shadow-[var(--shadow-hard-sm)]",
	light: "bg-card text-ink shadow-[var(--shadow-hard)] hover:bg-white hover:shadow-[var(--shadow-hard-sm)]",
	ghost: "text-ink-soft hover:bg-ink/5 hover:text-ink",
};

export function Tape({
	className,
	label,
	tone = "paper",
}: {
	readonly className?: string;
	readonly label?: string;
	readonly tone?: "paper" | "light";
}) {
	return (
		<span
			aria-hidden={label === undefined || undefined}
			className={clsx(
				"pointer-events-none absolute z-10 flex h-6 rotate-[-3deg] items-center justify-center shadow-[0_1px_2px_rgba(22,24,29,0.12)]",
				label === undefined ? "w-24" : "px-3.5",
				tone === "paper" ? "bg-[rgba(214,199,168,0.6)]" : "bg-[rgba(255,255,255,0.16)]",
				className,
			)}
			style={{
				maskImage: "linear-gradient(90deg, transparent 0, #000 6px, #000 calc(100% - 6px), transparent 100%)",
				WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 6px, #000 calc(100% - 6px), transparent 100%)",
			}}
		>
			{label !== undefined && (
				<span className="font-mono text-[0.625rem] tracking-[0.14em] text-[rgba(22,24,29,0.72)] uppercase">{label}</span>
			)}
		</span>
	);
}

export function TornEdge({ position, className }: { readonly position: "top" | "bottom"; readonly className?: string }) {
	return (
		<svg
			viewBox="0 0 1200 22"
			preserveAspectRatio="none"
			aria-hidden
			focusable="false"
			className={clsx(
				"pointer-events-none absolute inset-x-0 h-3 w-full sm:h-[22px]",
				position === "top" ? "bottom-full translate-y-px" : "top-full -translate-y-px",
				className,
			)}
		>
			<path d={position === "top" ? TOP_EDGE : BOTTOM_EDGE} fill="currentColor" />
		</svg>
	);
}

const TOP_EDGE =
	"M0,22 L0,13 L26,5 L53,16 L84,6 L118,15 L152,4 L188,14 L224,7 L262,17 L298,5 L336,13 L372,3 L410,16 L446,8 L484,18 L520,6 L558,12 L596,3 L634,15 L672,7 L710,17 L748,5 L786,14 L824,4 L862,16 L900,8 L938,18 L976,6 L1014,13 L1052,3 L1090,15 L1128,7 L1166,17 L1200,9 L1200,22 Z";

const BOTTOM_EDGE =
	"M0,0 L1200,0 L1200,12 L1172,19 L1140,6 L1104,17 L1068,5 L1030,15 L992,4 L954,16 L916,8 L878,18 L840,6 L802,14 L764,3 L726,17 L688,7 L650,15 L612,4 L574,18 L536,9 L498,16 L460,5 L422,14 L384,3 L346,17 L308,8 L270,15 L232,5 L194,13 L156,4 L118,16 L80,7 L42,18 L0,10 Z";

export function SectionHeader({
	eyebrow,
	title,
	description,
	action,
	tone = "ink",
	as: Heading = "h2",
	className,
}: {
	readonly eyebrow: string;
	readonly title: ReactNode;
	readonly description?: ReactNode;
	readonly action?: ReactNode;
	readonly tone?: "ink" | "light";
	readonly as?: "h1" | "h2";
	readonly className?: string;
}) {
	return (
		<div className={clsx("flex animate-fade-in flex-col gap-6 md:flex-row md:items-end md:justify-between", className)}>
			<div className="max-w-2xl">
				<p className={clsx("eyebrow", tone === "light" && "text-white/60")}>{eyebrow}</p>
				<Heading
					className={clsx(
						"mt-2 text-[clamp(1.9rem,4.6vw,3.1rem)] leading-[1.05]",
						tone === "light" ? "text-white" : "text-ink",
					)}
				>
					{title}
				</Heading>
				{description !== undefined && (
					<div
						className={clsx(
							"mt-5 text-[0.975rem] leading-relaxed",
							tone === "light" ? "text-white/70" : "text-ink-soft",
						)}
					>
						{description}
					</div>
				)}
			</div>
			{action !== undefined && <div className="shrink-0">{action}</div>}
		</div>
	);
}

export function NodeMark({ className }: { readonly className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className={clsx("h-[1em] w-[1em] shrink-0", className)}>
			<circle cx="5" cy="6" r="2.2" />
			<circle cx="5" cy="18" r="2.2" />
			<circle cx="19" cy="12" r="2.2" />
			<path d="M7 7.2 17 11M7 16.8 17 13" />
		</svg>
	);
}

export function HandArrow({ className }: { readonly className?: string }) {
	return (
		<svg viewBox="0 0 120 84" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
			<path d="M6 8c14-3 29 1 41 9 11 7 19 17 22 29 1 5 2 11 1 16" />
			<path d="M58 52c4 6 8 11 12 16" />
			<path d="M84 58c-5 4-9 7-14 10" />
		</svg>
	);
}

export function ThinkingDots({ label }: { readonly label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{[0, 1, 2].map((dot) => (
				<span key={dot} className="thinking-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${dot * 160}ms` }} />
			))}
			<span className="sr-only">{label}</span>
		</span>
	);
}

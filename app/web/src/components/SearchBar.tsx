import clsx from "clsx";
import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

export function SearchBar({
	initial,
	onSubmit,
	placeholder = "Posez une question",
	size = "large",
	busy = false,
}: {
	readonly initial: string;
	readonly onSubmit: (query: string) => void;
	readonly placeholder?: string;
	readonly size?: "large" | "medium";
	readonly busy?: boolean;
}) {
	const [value, setValue] = useState(initial);

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const query = value.trim();
		if (query.length >= 2) onSubmit(query);
	};

	return (
		<form
			onSubmit={submit}
			role="search"
			className={clsx(
				"flex items-center gap-2 rounded-[var(--radius-btn)] border border-rule-strong bg-card pl-4 shadow-[var(--shadow-hard)] transition-shadow focus-within:border-ink",
				size === "large" ? "h-16 pr-2" : "h-12 pr-1.5",
			)}
		>
			<Search className={clsx("shrink-0 text-ink-faint", size === "large" ? "size-5" : "size-4")} />
			<input
				value={value}
				onChange={(event) => setValue(event.target.value)}
				placeholder={placeholder}
				maxLength={300}
				aria-label="Question"
				className={clsx(
					"min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint",
					size === "large" ? "text-base sm:text-[1.0625rem]" : "text-[0.9375rem]",
				)}
			/>
			<button
				type="submit"
				disabled={busy || value.trim().length < 2}
				aria-label="Rechercher"
				className={clsx(
					"grid shrink-0 place-items-center rounded-[var(--radius-btn)] bg-ember text-white transition-colors hover:bg-rust disabled:bg-ink/10 disabled:text-ink-faint",
					size === "large" ? "h-12 w-12" : "h-9 w-9",
				)}
			>
				<ArrowRight className="size-4" />
			</button>
		</form>
	);
}

import clsx from "clsx";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export function ThemeToggle({ className }: { readonly className?: string }) {
	const dark = useSyncExternalStore(subscribe, isDark);

	const toggle = () => {
		const next = !dark;
		document.documentElement.classList.toggle("dark", next);
		try {
			localStorage.setItem("theme", next ? "dark" : "light");
		} catch {
			// Stockage indisponible (navigation privée) : le thème vaut pour la session seulement.
		}
	};

	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={dark ? "Passer en thème clair" : "Passer en thème sombre"}
			className={clsx(
				"grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink",
				className,
			)}
		>
			{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
		</button>
	);
}

function isDark(): boolean {
	return document.documentElement.classList.contains("dark");
}

function subscribe(callback: () => void): () => void {
	const observer = new MutationObserver(callback);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
	return () => observer.disconnect();
}

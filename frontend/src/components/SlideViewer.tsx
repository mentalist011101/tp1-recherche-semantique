import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { SLIDE_COUNT } from "../lib/labels.js";

export function SlideViewer({
	page,
	title,
	onClose,
}: {
	readonly page: number;
	readonly title: string;
	readonly onClose: () => void;
}) {
	const [current, setCurrent] = useState(page);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
			if (event.key === "ArrowLeft") setCurrent((p) => Math.max(1, p - 1));
			if (event.key === "ArrowRight") setCurrent((p) => Math.min(SLIDE_COUNT, p + 1));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-night/90 p-4 backdrop-blur-sm"
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-label={`Slide ${current}`}
		>
			<div className="w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
				<div className="mb-3 flex items-center justify-between text-white">
					<div className="text-sm">
						<span className="font-mono text-[0.6875rem] tracking-[0.12em] text-white/55 uppercase">slide {current} / {SLIDE_COUNT}</span>
						{current === page && <span className="ml-3 font-display font-bold tracking-tight">{title}</span>}
					</div>
					<button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Fermer">
						<X className="size-5" />
					</button>
				</div>
				<div className="relative overflow-hidden rounded-[3px] bg-white p-2 shadow-[var(--shadow-lift)]">
					<img src={`/slides/${current}.jpg`} alt={`Slide ${current} du cours INF5101`} className="w-full" />
					<button
						type="button"
						onClick={() => setCurrent((p) => Math.max(1, p - 1))}
						disabled={current === 1}
						className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-ember p-2 text-white shadow-[var(--shadow-hard)] hover:bg-rust disabled:opacity-0"
						aria-label="Slide précédente"
					>
						<ChevronLeft className="size-5" />
					</button>
					<button
						type="button"
						onClick={() => setCurrent((p) => Math.min(SLIDE_COUNT, p + 1))}
						disabled={current === SLIDE_COUNT}
						className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-ember p-2 text-white shadow-[var(--shadow-hard)] hover:bg-rust disabled:opacity-0"
						aria-label="Slide suivante"
					>
						<ChevronRight className="size-5" />
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}

import { Button } from "../components/paper.js";

export function NotFoundPage() {
	return (
		<div className="py-24 text-center">
			<p className="label-mono text-rust">404</p>
			<h1 className="mt-3 text-[clamp(2rem,5vw,3.2rem)] leading-tight">Cette page n'est pas dans l'index</h1>
			<p className="mt-3 font-editorial text-[1.125rem] text-ink-soft italic">Même la recherche sémantique ne la retrouve pas.</p>
			<Button to="/" className="mt-8">
				Retour à la recherche
			</Button>
		</div>
	);
}

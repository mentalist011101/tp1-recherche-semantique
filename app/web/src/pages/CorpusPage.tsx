import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client.js";
import type { Language, Modality } from "../api/types.js";
import { ArticleCard } from "../components/ArticleCard.js";
import { ErrorNotice, FilterChip, PageHeader, Spinner } from "../components/ui.js";
import { LANGUAGE_LABEL, LANGUAGES, MODALITIES, MODALITY_LABEL } from "../lib/labels.js";

export function CorpusPage() {
	const articles = useQuery({ queryKey: ["articles"], queryFn: api.articles, staleTime: Infinity });
	const [language, setLanguage] = useState<Language | undefined>();
	const [modality, setModality] = useState<Modality | undefined>();
	const [text, setText] = useState("");

	const needle = text.trim().toLowerCase();
	const visible = (articles.data ?? []).filter(
		(article) =>
			(language === undefined || article.langue === language) &&
			(modality === undefined || article.modalite === modality) &&
			(needle === "" || article.titre.toLowerCase().includes(needle)),
	);

	return (
		<div>
			<PageHeader eyebrow="Le corpus" title="50 articles scientifiques courts">
				35 articles en anglais tirés d'arXiv et 15 en français tirés de HAL (GRETSI, CORIA-TALN, JEP), de 2 à 6
				pages, sur les quatre modalités du cours. Chacun a été choisi à la main parmi 226 candidats ; la méthode est
				décrite dans le dépôt.
			</PageHeader>

			<div className="flex flex-col gap-3">
				<label className="flex h-11 max-w-md items-center gap-2 rounded-[var(--radius-btn)] border border-rule-strong bg-card px-3 focus-within:border-ink">
					<Search className="size-4 shrink-0 text-ink-faint" />
					<input
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder="Filtrer par titre"
						aria-label="Filtrer par titre"
						className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-ink-faint"
					/>
				</label>
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="label-mono mr-1 text-ink-faint">langue</span>
					<FilterChip active={language === undefined} onClick={() => setLanguage(undefined)}>
						Toutes
					</FilterChip>
					{LANGUAGES.map((value) => (
						<FilterChip key={value} active={language === value} onClick={() => setLanguage(value)}>
							{LANGUAGE_LABEL[value]}
						</FilterChip>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="label-mono mr-1 text-ink-faint">modalité</span>
					<FilterChip active={modality === undefined} onClick={() => setModality(undefined)}>
						Toutes
					</FilterChip>
					{MODALITIES.map((value) => (
						<FilterChip key={value} active={modality === value} onClick={() => setModality(value)}>
							{MODALITY_LABEL[value]}
						</FilterChip>
					))}
				</div>
			</div>

			<div className="mt-8">
				{articles.error && <ErrorNotice error={articles.error} />}
				{articles.isPending && (
					<div className="flex items-center gap-2 py-10 text-sm text-ink-soft">
						<Spinner /> Chargement du corpus…
					</div>
				)}
				{articles.data && (
					<>
						<p className="label-mono mb-4 text-ink-faint">{visible.length} articles</p>
						<div className="grid gap-4 lg:grid-cols-2">
							{visible.map((article) => (
								<ArticleCard key={article.doc_id} article={article} excerpt={article.resume} />
							))}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

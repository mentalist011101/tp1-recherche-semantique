import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { Crosshair, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { api } from "../api/client.js";
import type { MapPoint, Modality, Projection } from "../api/types.js";
import { Tape } from "../components/paper.js";
import { SearchBar } from "../components/SearchBar.js";
import { SlideViewer } from "../components/SlideViewer.js";
import { ErrorNotice, ModalityBadge, PageHeader, SourceBadge, Spinner } from "../components/ui.js";
import { CLUSTER_PALETTE, MODALITIES, MODALITY_COLOR, MODALITY_LABEL } from "../lib/labels.js";

const WIDTH = 1000;
const HEIGHT = 640;
const PADDING = 30;

type ColorBy = "modality" | "cluster";

export function MapPage() {
	const [params, setParams] = useSearchParams();
	const query = params.get("q") ?? "";
	const expected = useMemo(() => new Set((params.get("expected") ?? "").split(",").filter(Boolean)), [params]);

	const map = useQuery({ queryKey: ["map"], queryFn: api.map, staleTime: Infinity });
	const projection = useMutation({ mutationFn: api.project });
	const [colorBy, setColorBy] = useState<ColorBy>("modality");
	const [hidden, setHidden] = useState<ReadonlySet<Modality>>(new Set());
	const [showLabels, setShowLabels] = useState(true);
	const [hovered, setHovered] = useState<MapPoint | undefined>();
	const [selected, setSelected] = useState<MapPoint | undefined>();
	const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
	const svgRef = useRef<SVGSVGElement>(null);
	const zoomRef = useRef<ReturnType<typeof zoom<SVGSVGElement, unknown>>>(undefined);

	const { mutate: project } = projection;
	useEffect(() => {
		if (query) project(query);
	}, [query, project]);

	useEffect(() => {
		if (!svgRef.current) return;
		const behaviour = zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.8, 12])
			.on("zoom", (event) => setTransform(event.transform));
		select(svgRef.current).call(behaviour);
		zoomRef.current = behaviour;
	}, [map.isSuccess]);

	const resetZoom = () => {
		if (svgRef.current && zoomRef.current) {
			select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
		}
	};

	const byId = useMemo(() => new Map(map.data?.points.map((p) => [p.id, p]) ?? []), [map.data]);
	const centroids = useMemo(() => clusterCentroids(map.data?.points ?? []), [map.data]);
	const neighbourIds = useMemo(() => new Set(projection.data?.neighbours.map((n) => n.id) ?? []), [projection.data]);

	const colorOf = (point: MapPoint) =>
		colorBy === "modality" ? MODALITY_COLOR[point.modality] : CLUSTER_PALETTE[point.cluster % CLUSTER_PALETTE.length];

	const focus = Boolean(projection.data) || expected.size > 0;

	return (
		<div>
			<PageHeader eyebrow="Ce que le modèle voit" title="La carte des embeddings">
				Chaque point est un passage du corpus, encodé en 768 dimensions par Gemini Embedding 2 puis projeté en 2D avec
				UMAP. Deux points proches parlent de la même chose, même sans mot commun. Placez une question : elle atterrit
				là où le modèle la comprend, reliée à ses plus proches voisins dans l'espace d'origine.
			</PageHeader>

			<div className="grid gap-8 lg:grid-cols-[1fr_320px]">
				<div className="min-w-0">
					<div className="mb-4 max-w-2xl">
						<SearchBar
							key={query}
							initial={query}
							onSubmit={(q) => setParams({ q })}
							placeholder="Placer une question sur la carte…"
							size="medium"
							busy={projection.isPending}
						/>
					</div>

					<div className="mb-4 flex flex-wrap items-center gap-2 text-[0.8125rem]">
						{(["modality", "cluster"] as const).map((value) => (
							<button
								key={value}
								type="button"
								onClick={() => setColorBy(value)}
								className={clsx(
									"rounded-full px-3.5 py-2 transition-colors",
									colorBy === value ? "bg-ink text-paper" : "border border-rule text-ink-soft hover:text-ink",
								)}
							>
								{value === "modality" ? "Par modalité" : "Par thème (k-means)"}
							</button>
						))}
						<button
							type="button"
							onClick={() => setShowLabels((v) => !v)}
							className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-ink-soft hover:bg-ink/5 hover:text-ink"
						>
							{showLabels ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
							Étiquettes
						</button>
						<button
							type="button"
							onClick={resetZoom}
							className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-ink-soft hover:bg-ink/5 hover:text-ink"
						>
							<RotateCcw className="size-3.5" /> Recadrer
						</button>
						<span className="label-mono ml-auto text-ink-faint">molette : zoom · glisser : déplacer</span>
					</div>

					{map.error && <ErrorNotice error={map.error} />}
					<div className="relative overflow-hidden rounded-[var(--radius-card)] border border-rule bg-card shadow-[var(--shadow-card)]">
						{map.isPending && (
							<div className="flex h-96 items-center justify-center gap-2 text-sm text-ink-soft">
								<Spinner /> Chargement de la carte…
							</div>
						)}
						{map.data && (
							<svg
								ref={svgRef}
								viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
								className="block h-auto w-full cursor-grab touch-none grid-paper active:cursor-grabbing"
								role="img"
								aria-label="Projection UMAP des passages du corpus"
							>
								<g transform={transform.toString()}>
									{projection.data &&
										projection.data.neighbours.map((neighbour, index) => {
											const target = byId.get(neighbour.id);
											if (!target) return null;
											return (
												<line
													key={neighbour.id}
													x1={sx(projection.data.x)}
													y1={sy(projection.data.y)}
													x2={sx(target.x)}
													y2={sy(target.y)}
													stroke="#e0661c"
													strokeWidth={1.6 / transform.k}
													strokeOpacity={0.8 - index * 0.07}
													strokeDasharray={index === 0 ? undefined : `${4 / transform.k} ${3 / transform.k}`}
												/>
											);
										})}

									{map.data.points.map((point) => {
										if (hidden.has(point.modality)) return null;
										const isNeighbour = neighbourIds.has(point.id);
										const isExpected = expected.has(point.id) || expected.has(docOf(point.id));
										const dimmed = focus && !isNeighbour && !isExpected;
										const radius = (point.source === "cours" ? 5.5 : 4) / Math.sqrt(transform.k);
										return (
											<circle
												key={point.id}
												cx={sx(point.x)}
												cy={sy(point.y)}
												r={isNeighbour || isExpected ? radius * 1.5 : radius}
												fill={colorOf(point)}
												fillOpacity={dimmed ? 0.16 : 0.85}
												stroke={isExpected ? "#4a7a3a" : point.source === "cours" ? "var(--color-card)" : "none"}
												strokeWidth={(isExpected ? 2.5 : 1.2) / transform.k}
												className="cursor-pointer transition-[fill-opacity]"
												onMouseEnter={() => setHovered(point)}
												onMouseLeave={() => setHovered(undefined)}
												onClick={() => setSelected(point)}
											/>
										);
									})}

									{showLabels &&
										colorBy === "cluster" &&
										map.data.clusters.map((cluster) => {
											const centre = centroids.get(cluster.id);
											if (!centre) return null;
											return (
												<text
													key={cluster.id}
													x={sx(centre[0])}
													y={sy(centre[1])}
													textAnchor="middle"
													fontSize={13 / transform.k}
													fontWeight={700}
													className="pointer-events-none fill-ink font-display"
													stroke="var(--color-card)"
													strokeWidth={3.5 / transform.k}
													paintOrder="stroke"
												>
													{cluster.label}
												</text>
											);
										})}

									{projection.data && (
										<g transform={`translate(${sx(projection.data.x)} ${sy(projection.data.y)}) scale(${1 / transform.k})`}>
											<g className="animate-pin-drop" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
												<circle r={18} fill="#e0661c" fillOpacity={0.18} />
												<circle r={9} fill="#e0661c" stroke="#16181d" strokeWidth={2.5} />
											</g>
										</g>
									)}
								</g>
							</svg>
						)}

						{hovered && <Tooltip point={hovered} transform={transform} />}

						{map.data && (
							<div className="absolute bottom-3 left-3 flex flex-wrap gap-1 rounded-[var(--radius-card)] border border-rule bg-card/90 p-1.5 font-mono text-[0.6875rem] text-ink-soft shadow-[var(--shadow-card)] backdrop-blur">
								{MODALITIES.map((modality) => (
									<button
										key={modality}
										type="button"
										onClick={() =>
											setHidden((current) => {
												const next = new Set(current);
												if (next.has(modality)) next.delete(modality);
												else next.add(modality);
												return next;
											})
										}
										className={clsx(
											"flex items-center gap-1.5 rounded-full px-2 py-0.5 hover:bg-ink/5",
											hidden.has(modality) && "line-through opacity-35",
										)}
									>
										<span className="size-2.5 rounded-full" style={{ backgroundColor: MODALITY_COLOR[modality] }} />
										{MODALITY_LABEL[modality]}
									</button>
								))}
								<span className="flex items-center gap-1.5 px-2 text-ink-faint">
									<span className="size-2.5 rounded-full border-2 border-card bg-ink-faint shadow" /> slide du cours
								</span>
							</div>
						)}
					</div>
				</div>

				<aside className="space-y-5">
					{projection.data && (
						<NeighbourPanel query={query} projection={projection.data} byId={byId} onSelect={setSelected} />
					)}
					{projection.error && <ErrorNotice error={projection.error} />}
					{expected.size > 0 && (
						<div className="sticky-note rotate-[1deg] rounded-[var(--radius-card)] border border-kraft-deep/30 bg-kraft/70 p-4 text-sm text-[#16181d]">
							<p className="label-mono text-[#16181d]/50">analyse d'erreur</p>
							<p className="mt-2 leading-relaxed">
								Les points cerclés de <span className="font-semibold text-moss">vert</span> sont les passages
								attendus pour cette question de l'évaluation. S'ils sont loin de l'épingle, le modèle a « compris »
								la question autrement.
							</p>
						</div>
					)}
					{selected ? (
						<SelectedPanel point={selected} />
					) : (
						!projection.data && (
							<div className="relative rounded-[var(--radius-card)] border border-rule bg-card p-5 text-sm text-ink-soft shadow-[var(--shadow-card)]">
								<Tape className="-top-3 right-6 w-16 rotate-[3deg]" />
								<p className="label-mono text-ink-faint">Comment lire la carte</p>
								<ul className="mt-3 space-y-2.5">
									<Bullet>Les modalités forment des continents : texte, image, audio, vidéo.</Bullet>
									<Bullet>Les slides du cours, cerclées, se mêlent aux articles du même thème.</Bullet>
									<Bullet>
										UMAP préserve surtout le voisinage local : les distances entre continents éloignés ne sont
										pas interprétables.
									</Bullet>
									<Bullet>Passez « par thème » pour voir les groupes trouvés par k-means.</Bullet>
								</ul>
							</div>
						)
					)}
				</aside>
			</div>
		</div>
	);
}

function NeighbourPanel({
	query,
	projection,
	byId,
	onSelect,
}: {
	readonly query: string;
	readonly projection: Projection;
	readonly byId: ReadonlyMap<string, MapPoint>;
	readonly onSelect: (point: MapPoint) => void;
}) {
	return (
		<div className="overflow-hidden rounded-[var(--radius-card)] bg-night text-white shadow-[var(--shadow-lift)]">
			<div className="border-b border-white/10 px-4 py-3">
				<p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.12em] text-white/45 uppercase">
					<Crosshair className="size-3.5" /> plus proches voisins · cosinus
				</p>
				<p className="mt-2 font-display text-[0.9375rem] font-bold tracking-tight">« {query} »</p>
			</div>
			<ol className="space-y-0.5 p-2">
				{projection.neighbours.map((neighbour, index) => {
					const point = byId.get(neighbour.id);
					if (!point) return null;
					return (
						<li key={neighbour.id}>
							<button
								type="button"
								onClick={() => onSelect(point)}
								className="flex w-full items-start gap-2.5 rounded-[var(--radius-card)] p-2 text-left text-sm hover:bg-white/[0.06]"
							>
								<span className="mt-0.5 font-mono text-[0.6875rem] text-sun/70">{String(index + 1).padStart(2, "0")}</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-white/85">{point.heading}</span>
									<span className="font-mono text-[0.625rem] text-white/40">{neighbour.score.toFixed(3)}</span>
								</span>
								<span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: MODALITY_COLOR[point.modality] }} />
							</button>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

function SelectedPanel({ point }: { readonly point: MapPoint }) {
	const passage = useQuery({ queryKey: ["passage", point.id], queryFn: () => api.passage(point.id) });
	const [viewing, setViewing] = useState(false);
	return (
		<div className="animate-fade-in rounded-[var(--radius-card)] border border-rule bg-card p-5 shadow-[var(--shadow-card)]">
			<div className="mb-3 flex flex-wrap gap-1.5">
				<SourceBadge source={point.source} page={point.page} />
				<ModalityBadge modality={point.modality} />
			</div>
			<h3 className="text-[1.05rem] leading-tight font-extrabold tracking-tight">{point.heading}</h3>
			{passage.data ? (
				<p className="mt-2 max-h-64 overflow-y-auto text-sm leading-relaxed whitespace-pre-line text-ink-soft">
					{passage.data.text}
				</p>
			) : (
				<Spinner className="mt-2" />
			)}
			<div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-rule pt-3 text-[0.8125rem]">
				{point.page !== undefined && (
					<button type="button" onClick={() => setViewing(true)} className="text-ink transition-colors hover:text-rust">
						Voir la slide {point.page}
					</button>
				)}
				{passage.data?.url && (
					<a href={passage.data.url} target="_blank" rel="noreferrer noopener" className="text-ink transition-colors hover:text-rust">
						Lire l'article sur Wikipédia
					</a>
				)}
			</div>
			{viewing && point.page !== undefined && (
				<SlideViewer page={point.page} title={point.title} onClose={() => setViewing(false)} />
			)}
		</div>
	);
}

function Tooltip({ point, transform }: { readonly point: MapPoint; readonly transform: ZoomTransform }) {
	const [x, y] = transform.apply([sx(point.x), sy(point.y)]);
	const left = (x / WIDTH) * 100;
	const top = (y / HEIGHT) * 100;
	return (
		<div
			className="pointer-events-none absolute z-10 w-72 rounded-[var(--radius-card)] border border-rule bg-card/95 p-3 text-xs shadow-[var(--shadow-lift)] backdrop-blur"
			style={{
				left: `${left}%`,
				top: `${top}%`,
				transform: `translate(${left > 60 ? "-105%" : "5%"}, ${top > 60 ? "-105%" : "5%"})`,
			}}
		>
			<div className="mb-1 font-display font-bold tracking-tight text-ink">{point.heading}</div>
			<div className="line-clamp-4 text-ink-soft">{point.snippet}</div>
		</div>
	);
}

function Bullet({ children }: { readonly children: ReactNode }) {
	return (
		<li className="flex gap-3">
			<span aria-hidden className="mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
			<span>{children}</span>
		</li>
	);
}

function clusterCentroids(points: readonly MapPoint[]): ReadonlyMap<number, readonly [number, number]> {
	const groups = new Map<number, MapPoint[]>();
	for (const point of points) {
		groups.set(point.cluster, [...(groups.get(point.cluster) ?? []), point]);
	}
	return new Map(
		[...groups].map(([cluster, members]) => [cluster, [median(members.map((m) => m.x)), median(members.map((m) => m.y))] as const]),
	);
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function docOf(passageId: string): string {
	return passageId.includes("#") ? passageId.slice(0, passageId.indexOf("#")) : passageId;
}

function sx(x: number): number {
	return PADDING + x * (WIDTH - 2 * PADDING);
}

function sy(y: number): number {
	return PADDING + (1 - y) * (HEIGHT - 2 * PADDING);
}

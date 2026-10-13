const BOX_WIDTH = 180;
const BOX_HEIGHT = 74;

export function ArchitectureDiagram({ passages, threshold }: { readonly passages: number; readonly threshold: number }) {
	const formattedThreshold = threshold.toFixed(3).replace(".", ",");
	return (
		<div className="overflow-x-auto">
			<svg
				viewBox="0 0 1100 470"
				role="img"
				aria-label="Architecture : le notebook construit l'index Pinecone hors ligne ; en ligne, la question est encodée, comparée aux passages, puis sert la recherche d'articles ou le chat."
				className="h-auto w-full min-w-[860px]"
			>
				<defs>
					<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
						<path d="M0 0 10 5 0 10z" fill="var(--color-sun)" />
					</marker>
				</defs>

				<Lane y={24} label="Hors ligne · le notebook, une fois" />
				<Box x={20} y={40} title="50 PDF" lines={["arXiv et HAL, 2 à 6 pages", "choisis à la main"]} />
				<Box x={230} y={40} title="Markdown" lines={["pymupdf4llm ; page de garde", "HAL et références retirées"]} />
				<Box x={440} y={40} title={`${passages.toLocaleString("fr-FR")} passages`} lines={["LangChain, ≤ 1 000 car.", "préfixe « titre › section »"]} />
				<Box x={650} y={40} title="Embeddings" lines={["multilingual-e5-large", "1 024 dimensions"]} />
				<Arrow d="M200 77H226" />
				<Arrow d="M410 77H436" />
				<Arrow d="M620 77H646" />
				<Arrow d="M740 114V156" />

				<Database x={740} y={160} />

				<Lane y={290} label="En ligne · l'application, à chaque question" />
				<Box x={20} y={300} title="Question" lines={["en français", "ou en anglais"]} highlight />
				<Box x={230} y={300} title="Embedding" lines={["même modèle e5,", "préfixe « query: »"]} />
				<Box x={440} y={300} title="Recherche" lines={["les 60 passages", "les plus proches (cosinus)"]} />
				<Arrow d="M200 337H226" />
				<Arrow d="M410 337H436" />
				<Arrow d="M560 298L672 236" dashed bothEnds />

				<Diamond cx={740} cy={337} label={`≥ ${formattedThreshold} ?`} />
				<Arrow d="M620 337H666" />

				<Box x={870} y={248} width={210} title="Recherche" lines={["meilleur passage par article :", "les articles à lire"]} highlight />
				<Box x={870} y={360} width={210} title="Chat (RAG)" lines={["gpt-oss-120b rédige à partir", "des 6 passages, cite [n]"]} highlight />
				<Arrow d="M812 330L866 290" />
				<Arrow d="M812 344L866 392" />
				<text x={828} y={300} className="fill-white/55 font-mono text-[11px]">oui</text>

				<Arrow d="M740 380V412" />
				<text x={750} y={400} className="fill-white/55 font-mono text-[11px]">non</text>
				<rect x={655} y={416} width={170} height={40} rx={3} className="fill-white/[0.04] stroke-white/25" strokeDasharray="4 4" />
				<text x={740} y={441} textAnchor="middle" className="fill-white/75 text-[12.5px]">
					« rien dans ce corpus »
				</text>
			</svg>
		</div>
	);
}

function Lane({ y, label }: { readonly y: number; readonly label: string }) {
	return (
		<text x={20} y={y} className="fill-sun font-mono text-[11px] tracking-[0.14em] uppercase">
			{label}
		</text>
	);
}

function Box({
	x,
	y,
	title,
	lines,
	width = BOX_WIDTH,
	highlight = false,
}: {
	readonly x: number;
	readonly y: number;
	readonly title: string;
	readonly lines: readonly string[];
	readonly width?: number;
	readonly highlight?: boolean;
}) {
	return (
		<g>
			<rect
				x={x}
				y={y}
				width={width}
				height={BOX_HEIGHT}
				rx={3}
				className={highlight ? "fill-ember/20 stroke-ember" : "fill-white/[0.06] stroke-white/25"}
			/>
			<text x={x + 14} y={y + 25} className="fill-white font-display text-[15px] font-extrabold">
				{title}
			</text>
			{lines.map((line, index) => (
				<text key={line} x={x + 14} y={y + 45 + index * 16} className="fill-white/65 text-[11.5px]">
					{line}
				</text>
			))}
		</g>
	);
}

function Database({ x, y }: { readonly x: number; readonly y: number }) {
	const rx = 90;
	const ry = 12;
	const height = 70;
	return (
		<g>
			<path
				d={`M${x - rx} ${y + ry}V${y + ry + height}A${rx} ${ry} 0 0 0 ${x + rx} ${y + ry + height}V${y + ry}`}
				className="fill-white/[0.06] stroke-white/25"
			/>
			<ellipse cx={x} cy={y + ry} rx={rx} ry={ry} className="fill-night stroke-white/25" />
			<text x={x} y={y + 52} textAnchor="middle" className="fill-white font-display text-[15px] font-extrabold">
				Pinecone
			</text>
			<text x={x} y={y + 70} textAnchor="middle" className="fill-white/65 text-[11.5px]">
				index serverless, cosinus
			</text>
		</g>
	);
}

function Diamond({ cx, cy, label }: { readonly cx: number; readonly cy: number; readonly label: string }) {
	return (
		<g>
			<path d={`M${cx} ${cy - 42}L${cx + 70} ${cy}L${cx} ${cy + 42}L${cx - 70} ${cy}Z`} className="fill-white/[0.06] stroke-sun" />
			<text x={cx} y={cy - 4} textAnchor="middle" className="fill-white font-display text-[12.5px] font-extrabold">
				meilleur score
			</text>
			<text x={cx} y={cy + 13} textAnchor="middle" className="fill-sun font-mono text-[11.5px]">
				{label}
			</text>
		</g>
	);
}

function Arrow({
	d,
	dashed = false,
	bothEnds = false,
}: {
	readonly d: string;
	readonly dashed?: boolean;
	readonly bothEnds?: boolean;
}) {
	return (
		<path
			d={d}
			fill="none"
			className="stroke-sun"
			strokeWidth={1.6}
			strokeDasharray={dashed ? "5 4" : undefined}
			markerEnd="url(#arrow)"
			markerStart={bothEnds ? "url(#arrow)" : undefined}
		/>
	);
}

import { useCallback, useEffect, useState } from "react";

import { ask } from "../api/ask.js";
import type { SearchResponse } from "../api/types.js";
import type { AnswerState } from "../components/AnswerCard.js";

interface AskState {
	readonly key: string;
	readonly sources: SearchResponse | undefined;
	readonly answer: AnswerState | undefined;
	readonly failure: unknown;
}

export function useAsk(query: string | undefined, enabled: boolean) {
	const [attempt, setAttempt] = useState(0);
	const key = `${query}#${attempt}`;
	const [state, setState] = useState<AskState | undefined>();

	useEffect(() => {
		if (!query || !enabled) return;
		const controller = new AbortController();
		const update = (patch: Partial<Omit<AskState, "key">>) =>
			setState((s) => ({ key, sources: undefined, answer: undefined, failure: undefined, ...(s?.key === key ? s : {}), ...patch }));

		(async () => {
			let text = "";
			try {
				for await (const event of ask(query, controller.signal)) {
					switch (event.type) {
						case "sources":
							update({ sources: event.data });
							break;
						case "token":
							text += event.text;
							update({ answer: { status: "streaming", text } });
							break;
						case "abstain":
							update({ answer: { status: "abstained", reason: event.reason } });
							return;
						case "error":
							update({ answer: { status: "error", reason: event.reason, text } });
							return;
						case "done":
							update({ answer: { status: "done", text } });
							return;
					}
				}
			} catch (error) {
				if (!controller.signal.aborted) update({ answer: undefined, failure: error });
			}
		})();

		return () => controller.abort();
	}, [query, enabled, key]);

	const retry = useCallback(() => setAttempt((n) => n + 1), []);
	// Tant que la nouvelle requête n'a rien renvoyé, l'état affiché est « en cours » plutôt que
	// l'ancienne réponse : on dérive au rendu au lieu de réinitialiser l'état dans l'effet.
	const current = state?.key === key ? state : undefined;
	return {
		sources: current?.sources,
		answer: current?.answer ?? (query && enabled ? ({ status: "streaming", text: "" } as const) : undefined),
		failure: current?.failure,
		retry,
	};
}

import { Route, Routes } from "react-router";

import { Layout } from "./components/Layout.js";
import { AboutPage } from "./pages/AboutPage.js";
import { CemantixPage } from "./pages/CemantixPage.js";
import { ComparePage } from "./pages/ComparePage.js";
import { EvaluationPage } from "./pages/EvaluationPage.js";
import { MapPage } from "./pages/MapPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { QuizPage } from "./pages/QuizPage.js";
import { SearchPage } from "./pages/SearchPage.js";

export function App() {
	return (
		<Routes>
			<Route element={<Layout />}>
				<Route index element={<SearchPage />} />
				<Route path="comparer" element={<ComparePage />} />
				<Route path="carte" element={<MapPage />} />
				<Route path="evaluation" element={<EvaluationPage />} />
				<Route path="cemantix" element={<CemantixPage />} />
				<Route path="revision" element={<QuizPage />} />
				<Route path="a-propos" element={<AboutPage />} />
				<Route path="*" element={<NotFoundPage />} />
			</Route>
		</Routes>
	);
}

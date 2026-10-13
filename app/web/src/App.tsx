import { Route, Routes } from "react-router";

import { Layout } from "./components/Layout.js";
import { AboutPage } from "./pages/AboutPage.js";
import { ChatPage } from "./pages/ChatPage.js";
import { CorpusPage } from "./pages/CorpusPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { SearchPage } from "./pages/SearchPage.js";

export function App() {
	return (
		<Routes>
			<Route element={<Layout />}>
				<Route index element={<SearchPage />} />
				<Route path="chat" element={<ChatPage />} />
				<Route path="corpus" element={<CorpusPage />} />
				<Route path="a-propos" element={<AboutPage />} />
				<Route path="*" element={<NotFoundPage />} />
			</Route>
		</Routes>
	);
}

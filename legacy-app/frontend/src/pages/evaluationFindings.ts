export interface Finding {
	readonly tag: string;
	readonly title: string;
	readonly body: string;
}

export const FINDINGS: readonly Finding[] = [
	{
		tag: "Modèle",
		title: "Le modèle d'embedding fait presque tout",
		body: "À architecture égale, passer d'e5-small à Gemini Embedding 2 fait monter le Succès@1 de 72 % à 95 %, et le Succès@5 à 100 %. Aucune astuce de pipeline n'a approché cet écart : le choix du modèle dense est la décision qui compte.",
	},
	{
		tag: "Hybride",
		title: "Avec un bon modèle dense, BM25 devient du bruit",
		body: "La fusion RRF avec BM25 fait reculer la bonne réponse sur 13 questions et n'en améliore que 3 : le Succès@1 tombe de 95 % à 77 %. L'hybride compense un modèle dense faible (avec e5, il gagnait 2 points) ; face à Gemini, il dilue le bon classement.",
	},
	{
		tag: "Reranking",
		title: "Un reranker plus faible que le retriever",
		body: "bge-reranker-v2-m3 relit les 20 premiers candidats de l'hybride et remonte à 81 % en Succès@1, sans rattraper Gemini seul. Un cross-encoder n'est utile que s'il juge mieux que le premier étage : ce n'est plus le cas, et il ajoute plusieurs secondes de latence.",
	},
	{
		tag: "Paraphrases",
		title: "Le sens sans les mots",
		body: "Sur les questions formulées sans aucun mot-clé de la réponse, Gemini place le bon passage en tête 81 % du temps, contre 44 % pour BM25 et 31 % pour e5. Les trois échecs restants sont des quasi-réussites : la bonne réponse est au rang 2.",
	},
	{
		tag: "Corpus",
		title: "Le franglais du cours, enfin compris",
		body: "« Comment suivre une personne d'une image à l'autre ? » échouait avec tous les modèles : la slide attendue parle de tracking, Kalman filter, ByteTrack. Gemini la place au rang 1 ; l'hybride et le reranker la perdent de nouveau, tirés par les passages qui partagent des mots avec la question.",
	},
	{
		tag: "Cross-lingue",
		title: "Écarter BM25 pour l'anglais reste nécessaire",
		body: "Sur les questions en anglais, fusionner BM25 fait chuter le Succès@1 de 100 % à 70 %. Le routage par langue répare l'hybride (100 %), ce qui confirme le diagnostic : BM25 apparie quelques termes techniques partagés et pollue le classement.",
	},
	{
		tag: "Abstention",
		title: "Un seuil enfin robuste",
		body: "Avec e5, les cosinus du domaine et hors domaine se chevauchaient à quelques millièmes près. Avec Gemini, la question du domaine la moins bien notée (0,70) dépasse nettement la mieux notée hors domaine (0,59) : 8 refus sur 8, aucun refus à tort, 100 % en validation croisée.",
	},
	{
		tag: "Coût",
		title: "La qualité se paie en latence réseau",
		body: "Un embedding Gemini prend environ 1,5 s par l'API gratuite, contre quelques dizaines de millisecondes pour un modèle local. Sur une machine modeste, c'est pourtant le meilleur compromis : pas de modèle en mémoire, et une qualité qu'aucun modèle local testé n'atteint.",
	},
];

import type { Language, Modality } from "../api/types.js";

export const MODALITIES: readonly Modality[] = ["texte", "image", "audio", "multimodal"];

export const MODALITY_LABEL: Readonly<Record<Modality, string>> = {
	texte: "Texte",
	image: "Image",
	audio: "Audio",
	multimodal: "Multimodal",
};

export const MODALITY_COLOR: Readonly<Record<Modality, string>> = {
	texte: "#0f62ce",
	image: "#4a7a3a",
	audio: "#e0661c",
	multimodal: "#7b3f8f",
};

export const LANGUAGES: readonly Language[] = ["fr", "en"];

export const LANGUAGE_LABEL: Readonly<Record<Language, string>> = {
	fr: "Français",
	en: "Anglais",
};

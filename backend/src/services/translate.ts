import { transliterate as tr } from "transliteration";
import { SarvamAIClient } from "sarvamai";

type TranslationProviderResponse = {
    translated_text?: unknown;
};

type TranslationErrorBody = {
    message: string;
    providerStatusCode?: number;
    details?: unknown;
};

export type TranslationServiceError = {
    kind: "translation-service-error";
    statusCode: number;
    body: TranslationErrorBody;
};

export type TranslationResult = {
    translatedString: string;
    transliteratedRomanString: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readNonEmptyString(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function createTranslationError(statusCode: number, message: string, details?: unknown): TranslationServiceError {
    const body: TranslationErrorBody = { message };

    if (details !== undefined) {
        body.details = details;
    }

    return {
        kind: "translation-service-error",
        statusCode,
        body
    };
}

function isTranslationServiceError(value: unknown): value is TranslationServiceError {
    if (
        !isObject(value)
        || value.kind !== "translation-service-error"
        || typeof value.statusCode !== "number"
        || !("body" in value)
    ) {
        return false;
    }

    return isObject(value.body) && typeof value.body.message === "string";
}

function normalizeProviderError(error: unknown): TranslationServiceError {
    if (isTranslationServiceError(error)) {
        return error;
    }

    if (isObject(error) && typeof error.statusCode === "number") {
        return {
            kind: "translation-service-error",
            statusCode: error.statusCode,
            body: {
                message: "Translation provider request failed.",
                providerStatusCode: error.statusCode,
                details: error.body ?? null
            }
        };
    }

    if (error instanceof Error) {
        return createTranslationError(502, "Translation provider request failed.", {
            message: readNonEmptyString(error.message) || "Unknown provider error"
        });
    }

    return createTranslationError(502, "Translation provider request failed.");
}

export class Translate {
    private static translateInstance: Translate;
    private client: any;

    private constructor() {
        this.client = new SarvamAIClient({
            apiSubscriptionKey: process.env.SARVAM_API_KEY
        });
    }

    public static getInstance(): Translate {
        if (this.translateInstance == null) {
            this.translateInstance = new Translate();
        }

        return this.translateInstance;
    }

    public async getKashmiriTranslation(input: string): Promise<TranslationResult> {
        try {
            const response = await this.client.text.translate({
                input: input,
                source_language_code: "en-IN",
                target_language_code: "ks-IN",
                model: "sarvam-translate:v1"
            }) as TranslationProviderResponse;

            const translatedString = readNonEmptyString(response?.translated_text);

            if (!translatedString) {
                throw createTranslationError(502, "Translation provider returned an invalid response.", {
                    translatedText: response?.translated_text ?? null
                });
            }

            let transliteratedRomanString = "";

            try {
                transliteratedRomanString = readNonEmptyString(tr(translatedString));
            } catch (_error) {
                throw createTranslationError(502, "Unable to transliterate translated text.", {
                    translatedString
                });
            }

            if (!transliteratedRomanString) {
                throw createTranslationError(502, "Unable to transliterate translated text.", {
                    translatedString
                });
            }

            return {
                translatedString,
                transliteratedRomanString
            };
        } catch (error) {
            throw normalizeProviderError(error);
        }
    }
}

import express, { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ResponseObject } from "./utils/responseobject";
import dotenv from "dotenv";
import http from "node:http";

import { Translate } from "./services/translate";
import { TranslateRequestBody, translateRequestSchema } from "./validation/translate-request-schema";
import { createSchemaValidator, validateRequestBody } from "./validation/validate-request";

dotenv.config();

export type AppConfig = {
    server: {
        host: string;
        port: number;
    };
    api: {
        basePath: string;
        greetingMessage: string;
    };
};

function buildErrorResponse(statusCode: number, description: string, data: unknown = null): ResponseObject {
    return new ResponseObject(statusCode, "Error", description, data);
}

function resolveErrorStatusCode(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 400 || value > 599) {
        return 502;
    }

    return value;
}

function resolveErrorBody(error: unknown): unknown {
    if (error && typeof error === "object" && "body" in error) {
        return (error as { body?: unknown }).body ?? null;
    }

    if (error instanceof Error) {
        return {
            message: "Translation request failed unexpectedly."
        };
    }

    return {
        message: "Translation request failed unexpectedly."
    };
}

function isTranslationResult(value: unknown): value is {
    translatedString: string;
    transliteratedRomanString: string;
} {
    if (!value || typeof value !== "object") {
        return false;
    }

    const translation = value as {
        translatedString?: unknown;
        transliteratedRomanString?: unknown;
    };

    return typeof translation.translatedString === "string"
        && translation.translatedString.trim().length > 0
        && typeof translation.transliteratedRomanString === "string"
        && translation.transliteratedRomanString.trim().length > 0;
}

export function loadConfig(): AppConfig {
    const configPath = path.resolve(__dirname, "../config/app.yaml");
    const rawYaml = fs.readFileSync(configPath, "utf8");
    const parsed = yaml.load(rawYaml);

    if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid YAML configuration");
    }

    return parsed as AppConfig;
}

export const validateTranslateRequest = validateRequestBody(
    createSchemaValidator(translateRequestSchema),
    "Invalid request body. Expected JSON matching schema { \"text\": \"<non-empty string>\" } with no additional properties."
);

export async function translateRequestHandler(req: Request<{}, {}, TranslateRequestBody>, res: Response): Promise<void> {
    const input = req?.body?.text?.trim();

    try {
        const translatedStringObject: any = await Translate.getInstance().getKashmiriTranslation(input);

        if (!isTranslationResult(translatedStringObject)) {
            const error: ResponseObject = new ResponseObject(
                502,
                "Error",
                "Translation failed.",
                {
                    message: "Translation service returned an invalid response."
                }
            );

            res.status(502).json({
                data: error
            });
            return;
        }

        const response: ResponseObject = new ResponseObject(200, "Success!", "String translated: " + input, translatedStringObject);

        res.status(200).json({
            data: response
        });
    } catch (err: any) {
        const statusCode = resolveErrorStatusCode(err?.statusCode);
        const error: ResponseObject = new ResponseObject(
            statusCode,
            "Error",
            "Translation failed.",
            resolveErrorBody(err)
        );

        res.status(statusCode).json({
            data: error
        });
    }
}

export function healthHandler(_req: Request, res: Response): void {
    res.status(200).json({
        service: "translate-api",
        status: "ok",
    });
}

export function malformedJsonHandler(
    err: SyntaxError & { status?: number; body?: unknown; type?: string },
    _req: Request,
    res: Response,
    next: NextFunction
): void {
    if (err.status === 413 || err.type === "entity.too.large") {
        const error = buildErrorResponse(413, "Request body too large.");

        res.status(413).json({
            data: error
        });
        return;
    }

    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        const error = buildErrorResponse(400, "Malformed JSON in request body.");

        res.status(400).json({
            data: error
        });
        return;
    }

    next(err);
}

export function createApp(config: AppConfig = loadConfig()) {
    const app = express();
    const router = express.Router();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    router.post("/", validateTranslateRequest, translateRequestHandler);

    router.get("/health", healthHandler);

    app.use(config.api.basePath, router);

    app.use(malformedJsonHandler);

    return app;
}

export function startServer(config: AppConfig = loadConfig()): http.Server {
    const app = createApp(config);

    return app.listen(config.server.port, config.server.host, () => {
        console.log(
            `Server running at http://localhost:${config.server.port}${config.api.basePath}/`
        );

        console.log(config.api.greetingMessage);
    });
}

if (require.main === module) {
    startServer();
}
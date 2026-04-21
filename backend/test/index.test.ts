import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import { NextFunction, Request, Response } from "express";
import {
    healthHandler,
    malformedJsonHandler,
    translateRequestHandler,
    validateTranslateRequest
} from "../src/index";
import { Translate } from "../src/services/translate";

type MockResponse = Response & {
    statusCode?: number;
    jsonBody?: unknown;
};

function createMockResponse(): MockResponse {
    const response = {} as MockResponse;

    response.status = function status(code: number) {
        response.statusCode = code;
        return response;
    } as Response["status"];

    response.json = function json(body: unknown) {
        response.jsonBody = body;
        return response;
    } as Response["json"];

    return response;
}

const originalGetInstance = Translate.getInstance;
const invalidRequestBodies = [
    {},
    { text: "   " },
    { text: null },
    { text: 123 },
    { text: ["hello"] },
    { text: "hello", extra: true }
];

describe("index handlers", () => {
    afterEach(() => {
        Translate.getInstance = originalGetInstance;
    });

    it("returns health status", () => {
        const response = createMockResponse();

        healthHandler({} as Request, response);

        expect(response.statusCode).to.equal(200);
        expect(response.jsonBody).to.deep.equal({
            service: "translate-api",
            status: "ok"
        });
    });

    it("accepts valid translate requests", () => {
        const request = {
            body: {
                text: " hello "
            }
        } as Request;
        const response = createMockResponse();
        let nextCalled = false;

        validateTranslateRequest(request, response, (() => {
            nextCalled = true;
        }) as NextFunction);

        expect(nextCalled).to.equal(true);
        expect(response.statusCode).to.equal(undefined);
    });

    for (const invalidBody of invalidRequestBodies) {
        it(`rejects invalid request body ${JSON.stringify(invalidBody)}`, () => {
            const request = {
                body: invalidBody
            } as Request;
            const response = createMockResponse();
            let nextCalled = false;

            validateTranslateRequest(request, response, (() => {
                nextCalled = true;
            }) as NextFunction);

            const body = response.jsonBody as any;

            expect(nextCalled).to.equal(false);
            expect(response.statusCode).to.equal(400);
            expect(body.data.statusCode).to.equal(400);
            expect(body.data.description).to.contain("Invalid request body");
            expect(body.data.data).to.be.an("array").that.is.not.empty;
        });
    }

    it("returns translated data for valid input", async () => {
        let capturedInput = "";

        Translate.getInstance = (() => ({
            getKashmiriTranslation: async (input: string) => {
                capturedInput = input;

                return {
                    translatedString: `translated:${input}`,
                    transliteratedRomanString: `roman:${input}`
                };
            }
        })) as typeof Translate.getInstance;

        const request = {
            body: {
                text: "  hello world  "
            }
        } as Request<{}, {}, { text: string }>;
        const response = createMockResponse();

        await translateRequestHandler(request, response);

        const body = response.jsonBody as any;

        expect(response.statusCode).to.equal(200);
        expect(capturedInput).to.equal("hello world");
        expect(body.data.statusCode).to.equal(200);
        expect(body.data.description).to.equal("String translated: hello world");
        expect(body.data.data).to.deep.equal({
            translatedString: "translated:hello world",
            transliteratedRomanString: "roman:hello world"
        });
    });

    it("returns an error response when translation fails", async () => {
        Translate.getInstance = (() => ({
            getKashmiriTranslation: async () => {
                throw {
                    statusCode: 503,
                    body: { message: "provider unavailable" }
                };
            }
        })) as typeof Translate.getInstance;

        const request = {
            body: {
                text: "hello world"
            }
        } as Request<{}, {}, { text: string }>;
        const response = createMockResponse();

        await translateRequestHandler(request, response);

        const body = response.jsonBody as any;

        expect(response.statusCode).to.equal(503);
        expect(body.data.statusCode).to.equal(503);
        expect(body.data.description).to.equal("Translation failed.");
        expect(body.data.data).to.deep.equal({
            message: "provider unavailable"
        });
    });

    it("normalizes unexpected translation failures to a gateway error", async () => {
        Translate.getInstance = (() => ({
            getKashmiriTranslation: async () => {
                throw new Error("socket hang up");
            }
        })) as typeof Translate.getInstance;

        const request = {
            body: {
                text: "hello world"
            }
        } as Request<{}, {}, { text: string }>;
        const response = createMockResponse();

        await translateRequestHandler(request, response);

        const body = response.jsonBody as any;

        expect(response.statusCode).to.equal(502);
        expect(body.data.statusCode).to.equal(502);
        expect(body.data.data).to.deep.equal({
            message: "Translation request failed unexpectedly."
        });
    });

    it("rejects malformed translation payloads returned by the service", async () => {
        Translate.getInstance = (() => ({
            getKashmiriTranslation: async () => ({
                translatedString: "",
                transliteratedRomanString: "roman"
            })
        })) as typeof Translate.getInstance;

        const request = {
            body: {
                text: "hello world"
            }
        } as Request<{}, {}, { text: string }>;
        const response = createMockResponse();

        await translateRequestHandler(request, response);

        const body = response.jsonBody as any;

        expect(response.statusCode).to.equal(502);
        expect(body.data.statusCode).to.equal(502);
        expect(body.data.description).to.equal("Translation failed.");
        expect(body.data.data).to.deep.equal({
            message: "Translation service returned an invalid response."
        });
    });

    it("returns a malformed json error for syntax failures", () => {
        const response = createMockResponse();
        let forwardedError: unknown;

        const error = new SyntaxError("Unexpected end of JSON input") as SyntaxError & { status?: number; body?: unknown };
        error.status = 400;
        error.body = "{\"text\":";

        malformedJsonHandler(error, {} as Request, response, ((nextError?: unknown) => {
            forwardedError = nextError;
        }) as NextFunction);

        const body = response.jsonBody as any;

        expect(forwardedError).to.equal(undefined);
        expect(response.statusCode).to.equal(400);
        expect(body.data.description).to.equal("Malformed JSON in request body.");
    });

    it("returns a structured error when the request body is too large", () => {
        const response = createMockResponse();
        let forwardedError: unknown;

        const error = new SyntaxError("request entity too large") as SyntaxError & { status?: number; body?: unknown; type?: string };
        error.status = 413;
        error.type = "entity.too.large";

        malformedJsonHandler(error, {} as Request, response, ((nextError?: unknown) => {
            forwardedError = nextError;
        }) as NextFunction);

        const body = response.jsonBody as any;

        expect(forwardedError).to.equal(undefined);
        expect(response.statusCode).to.equal(413);
        expect(body.data.description).to.equal("Request body too large.");
    });

    it("forwards non-json parser errors to the next middleware", () => {
        const response = createMockResponse();
        let forwardedError: unknown;

        const error = new Error("boom");

        malformedJsonHandler(error as SyntaxError & { status?: number; body?: unknown }, {} as Request, response, ((nextError?: unknown) => {
            forwardedError = nextError;
        }) as NextFunction);

        expect(forwardedError).to.equal(error);
        expect(response.statusCode).to.equal(undefined);
    });
});

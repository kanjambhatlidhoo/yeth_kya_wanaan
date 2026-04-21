import { expect } from "chai";
import http, { Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "mocha";
import { AppConfig, createApp } from "../src/index";
import { Translate } from "../src/services/translate";

const TEST_CONFIG: AppConfig = {
    server: {
        host: "127.0.0.1",
        port: 0
    },
    api: {
        basePath: "/api/translate",
        greetingMessage: "test"
    }
};

type JsonRecord = Record<string, any>;

const originalGetInstance = Translate.getInstance;

function listen(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(TEST_CONFIG.server.port, TEST_CONFIG.server.host, () => {
            server.off("error", reject);
            resolve();
        });
    });
}

function close(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

describe("translate api chaos", () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
        server = http.createServer(createApp(TEST_CONFIG));
        await listen(server);

        const address = server.address() as AddressInfo;
        baseUrl = `http://${TEST_CONFIG.server.host}:${address.port}${TEST_CONFIG.api.basePath}`;
    });

    afterEach(async () => {
        Translate.getInstance = originalGetInstance;

        if (server.listening) {
            await close(server);
        }
    });

    it("returns a structured error for malformed json payloads", async () => {
        const response = await fetch(`${baseUrl}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: "{\"text\":"
        });

        const body = await response.json() as JsonRecord;

        expect(response.status).to.equal(400);
        expect(body.data.statusCode).to.equal(400);
        expect(body.data.description).to.equal("Malformed JSON in request body.");
    });

    it("rejects non-object request payloads", async () => {
        const response = await fetch(`${baseUrl}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(["hello"])
        });

        const body = await response.json() as JsonRecord;

        expect(response.status).to.equal(400);
        expect(body.data.statusCode).to.equal(400);
        expect(body.data.data).to.deep.equal([
            {
                path: "/",
                message: "must be object"
            }
        ]);
    });

    it("returns a structured 413 error for oversized payloads", async () => {
        const response = await fetch(`${baseUrl}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: "a".repeat(120_000)
            })
        });

        const body = await response.json() as JsonRecord;

        expect(response.status).to.equal(413);
        expect(body.data.statusCode).to.equal(413);
        expect(body.data.description).to.equal("Request body too large.");
    });

    it("fails predictably when the translation service returns malformed success data", async () => {
        Translate.getInstance = (() => ({
            getKashmiriTranslation: async () => ({
                translatedString: "",
                transliteratedRomanString: "roman"
            })
        })) as typeof Translate.getInstance;

        const response = await fetch(`${baseUrl}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: "hello"
            })
        });

        const body = await response.json() as JsonRecord;

        expect(response.status).to.equal(502);
        expect(body.data.statusCode).to.equal(502);
        expect(body.data.description).to.equal("Translation failed.");
        expect(body.data.data).to.deep.equal({
            message: "Translation service returned an invalid response."
        });
    });

    it("surfaces provider-style outages without returning a fake success", async () => {
        Translate.getInstance = (() => ({
            getKashmiriTranslation: async () => {
                throw {
                    statusCode: 503,
                    body: {
                        message: "provider unavailable"
                    }
                };
            }
        })) as typeof Translate.getInstance;

        const response = await fetch(`${baseUrl}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: "hello"
            })
        });

        const body = await response.json() as JsonRecord;

        expect(response.status).to.equal(503);
        expect(body.data.statusCode).to.equal(503);
        expect(body.data.data).to.deep.equal({
            message: "provider unavailable"
        });
    });

    it("maps unexpected translation failures to a predictable bad gateway response", async () => {
        Translate.getInstance = (() => ({
            getKashmiriTranslation: async () => {
                throw new Error("socket hang up");
            }
        })) as typeof Translate.getInstance;

        const response = await fetch(`${baseUrl}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: "hello"
            })
        });

        const body = await response.json() as JsonRecord;

        expect(response.status).to.equal(502);
        expect(body.data.statusCode).to.equal(502);
        expect(body.data.description).to.equal("Translation failed.");
        expect(body.data.data).to.deep.equal({
            message: "Translation request failed unexpectedly."
        });
    });
});

import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import { Translate } from "../src/services/translate";

describe("Translate service", () => {
    afterEach(() => {
        (Translate as any).translateInstance = undefined;
    });

    it("reuses a single service instance", () => {
        const firstInstance = Translate.getInstance();
        const secondInstance = Translate.getInstance();

        expect(firstInstance).to.equal(secondInstance);
    });

    it("returns translated and transliterated strings", async () => {
        const service = Translate.getInstance();
        (service as any).client = {
            text: {
                translate: async () => ({
                    translated_text: "asalaam"
                })
            }
        };

        const result = await service.getKashmiriTranslation("hello");

        expect(result).to.deep.equal({
            translatedString: "asalaam",
            transliteratedRomanString: "asalaam"
        });
    });

    it("throws a predictable error when the provider returns no translation", async () => {
        const service = Translate.getInstance();
        (service as any).client = {
            text: {
                translate: async () => ({
                    translated_text: "   "
                })
            }
        };

        try {
            await service.getKashmiriTranslation("hello");
            expect.fail("Expected translation service to reject empty provider output");
        } catch (error: any) {
            expect(error.statusCode).to.equal(502);
            expect(error.body).to.deep.equal({
                message: "Translation provider returned an invalid response.",
                details: {
                    translatedText: "   "
                }
            });
        }
    });

    it("preserves provider errors with status codes", async () => {
        const service = Translate.getInstance();
        (service as any).client = {
            text: {
                translate: async () => {
                    throw {
                        statusCode: 503,
                        body: {
                            message: "provider unavailable"
                        }
                    };
                }
            }
        };

        try {
            await service.getKashmiriTranslation("hello");
            expect.fail("Expected translation service to throw provider error");
        } catch (error: any) {
            expect(error.statusCode).to.equal(503);
            expect(error.body).to.deep.equal({
                message: "Translation provider request failed.",
                providerStatusCode: 503,
                details: {
                    message: "provider unavailable"
                }
            });
        }
    });

    it("normalizes unexpected provider failures to a gateway error", async () => {
        const service = Translate.getInstance();
        (service as any).client = {
            text: {
                translate: async () => {
                    throw new Error("network down");
                }
            }
        };

        try {
            await service.getKashmiriTranslation("hello");
            expect.fail("Expected translation service to reject provider failure");
        } catch (error: any) {
            expect(error.statusCode).to.equal(502);
            expect(error.body).to.deep.equal({
                message: "Translation provider request failed.",
                details: {
                    message: "network down"
                }
            });
        }
    });
});

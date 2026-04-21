import { JSONSchemaType } from "ajv";

export type TranslateRequestBody = {
    text: string;
};

export const translateRequestSchema: JSONSchemaType<TranslateRequestBody> = {
    type: "object",
    properties: {
        text: {
            type: "string",
            minLength: 1,
            pattern: ".*\\S.*"
        }
    },
    required: ["text"],
    additionalProperties: false
};

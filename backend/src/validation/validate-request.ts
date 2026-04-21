import Ajv, { ErrorObject, JSONSchemaType, ValidateFunction } from "ajv";
import { NextFunction, Request, Response } from "express";
import { ResponseObject } from "../utils/responseobject";

const ajv = new Ajv({
    allErrors: true
});

function buildErrorResponse(statusCode: number, description: string, data: unknown = null): ResponseObject {
    return new ResponseObject(statusCode, "Error", description, data);
}

function formatAjvErrors(errors: ErrorObject[] = []): Array<{ path: string; message: string }> {
    return errors.map((error) => ({
        path: error.instancePath || "/",
        message: error.message ?? "Invalid value"
    }));
}

export function createSchemaValidator<T>(schema: JSONSchemaType<T>): ValidateFunction<T> {
    return ajv.compile(schema);
}

export function validateRequestBody<T>(
    validator: ValidateFunction<T>,
    invalidBodyDescription: string
) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!validator(req.body)) {
            const error = buildErrorResponse(
                400,
                invalidBodyDescription,
                formatAjvErrors(validator.errors ?? [])
            );

            res.status(400).json({
                data: error
            });
            return;
        }

        next();
    };
}

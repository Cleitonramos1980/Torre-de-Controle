import { ZodError } from "zod";
export class AppError extends Error {
    statusCode;
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}
export function setErrorHandler(app) {
    app.setErrorHandler((error, request, reply) => {
        const requestId = request.correlationId ?? request.id;
        const statusCode = error instanceof AppError ? error.statusCode : error instanceof ZodError ? 400 : 500;
        const zodIssues = error instanceof ZodError ? error.issues : undefined;
        request.log.error({
            requestId,
            statusCode,
            message: error.message,
            zodIssues,
        }, "request failed");
        reply.status(statusCode).send({
            error: {
                message: error.message || "Erro interno",
                requestId,
                issues: zodIssues,
            },
        });
    });
}

import { registerRedeSalesValidationRoutes } from "./rede-sales-validation.controller.js";
import { RedeSalesImportService } from "./rede-sales-import.service.js";
import { RedeSalesMatchingService } from "./rede-sales-matching.service.js";
import { RedeSalesParserService } from "./rede-sales-parser.service.js";
import { RedeSalesValidationRepository } from "./rede-sales-validation.repository.js";
import { RedeSalesValidationService } from "./rede-sales-validation.service.js";
import { WinthorSalesValidationRepository } from "./winthor-sales-validation.repository.js";
export async function registerRedeSalesValidationModule(app, logger) {
    const repository = new RedeSalesValidationRepository();
    const parserService = new RedeSalesParserService();
    const importService = new RedeSalesImportService();
    const matchingService = new RedeSalesMatchingService(logger);
    const winthorRepository = new WinthorSalesValidationRepository(logger);
    const service = new RedeSalesValidationService(logger, {
        parserService,
        importService,
        repository,
        matchingService,
        winthorRepository,
    });
    await registerRedeSalesValidationRoutes(app, service);
    return service;
}

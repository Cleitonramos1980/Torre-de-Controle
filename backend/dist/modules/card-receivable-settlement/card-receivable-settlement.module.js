import { registerCardReceivableSettlementRoutes } from "./card-receivable-settlement.controller.js";
import { CardReceivableFilialResolverService } from "./card-receivable-filial-resolver.service.js";
import { CardReceivableSettlementImportService } from "./card-receivable-settlement-import.service.js";
import { CardReceivableSettlementMatchingService } from "./card-receivable-settlement-matching.service.js";
import { CardReceivableSettlementParserService } from "./card-receivable-settlement-parser.service.js";
import { CardReceivableSettlementRepository } from "./card-receivable-settlement.repository.js";
import { CardReceivableSettlementService } from "./card-receivable-settlement.service.js";
import { FilialEstabelecimentoLinkRepository } from "./filial-estabelecimento-link.repository.js";
import { FilialEstabelecimentoLinkService } from "./filial-estabelecimento-link.service.js";
import { WinthorPcprestSettlementRepository } from "./winthor-pcprest-settlement.repository.js";
export async function registerCardReceivableSettlementModule(app, logger) {
    const repository = new CardReceivableSettlementRepository();
    const parserService = new CardReceivableSettlementParserService();
    const importService = new CardReceivableSettlementImportService();
    const matchingService = new CardReceivableSettlementMatchingService(logger);
    const winthorRepository = new WinthorPcprestSettlementRepository(logger);
    const filialEstabelecimentoLinkRepository = new FilialEstabelecimentoLinkRepository();
    const filialEstabelecimentoLinkService = new FilialEstabelecimentoLinkService(filialEstabelecimentoLinkRepository);
    const filialResolverService = new CardReceivableFilialResolverService(filialEstabelecimentoLinkRepository);
    const service = new CardReceivableSettlementService(logger, {
        parserService,
        importService,
        repository,
        matchingService,
        winthorRepository,
        filialResolverService,
        filialEstabelecimentoLinkService,
    });
    await registerCardReceivableSettlementRoutes(app, service);
    return service;
}

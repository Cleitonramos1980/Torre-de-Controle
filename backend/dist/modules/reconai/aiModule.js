import { AiFinancialService } from "./aiFinancialService.js";
export class AiModule {
    aiFinancialService;
    constructor(logger) {
        this.aiFinancialService = new AiFinancialService(logger);
    }
}

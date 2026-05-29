import { AutomationService } from "./automationService.js";
export class AutomationModule {
    automationService;
    constructor(logger) {
        this.automationService = new AutomationService(logger);
    }
}

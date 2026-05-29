import { RedeAuthService } from "./redeAuthService.js";
import { RedeAccessService } from "./redeAccessService.js";
import { RedeService } from "./redeService.js";
import { WinThorService } from "./winthorService.js";
export class RedeModule {
    authService;
    winThorService;
    redeService;
    redeAccessService;
    constructor(logger) {
        this.authService = new RedeAuthService(logger);
        this.winThorService = new WinThorService(logger);
        this.redeService = new RedeService(logger, this.authService, this.winThorService);
        this.redeAccessService = new RedeAccessService(logger, this.authService);
    }
}

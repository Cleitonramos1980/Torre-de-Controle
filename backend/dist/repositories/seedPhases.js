/**
 * Seed data for Phase 1-3: Torre de Controle, Agendamento, Custódia
 */
import { db } from "./dataStore.js";
import { mockExcecoesTorre, mockTorreKPIs } from "./seedTorreData.js";
import { mockAgendamentosSlots, mockDockCapacity, mockAgendamentoKPIs } from "./seedAgendamentoData.js";
import { mockCustodias, mockCustodiaKPIs } from "./seedCustodiaData.js";
export function seedPhasesData() {
    if (db.torreExcecoes.length > 0)
        return;
    db.torreExcecoes = mockExcecoesTorre;
    db.torreKPIs = mockTorreKPIs;
    db.agendamentosSlots = mockAgendamentosSlots;
    db.agendamentoDockCapacity = mockDockCapacity;
    db.agendamentoKPIs = mockAgendamentoKPIs;
    db.custodias = mockCustodias;
    db.custodiaKPIs = mockCustodiaKPIs;
}

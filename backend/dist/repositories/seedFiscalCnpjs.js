/**
 * Seed fiscal: popula fiscalCnpjs e fiscalControleNsu a partir de PCFILIAL (Oracle).
 * Executa apenas se Oracle habilitado e coleções ainda vazias.
 */
import { db, nextId } from "./dataStore.js";
import { isOracleEnabled, executeOracle } from "../db/oracle.js";

function formatCnpj(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, "").padStart(14, "0");
    if (digits.length !== 14) return digits;
    return digits;
}

function capitalize(str) {
    if (!str) return str;
    return str.trim().replace(/\s+/g, " ");
}

export async function seedFiscalCnpjsFromOracle() {
    if (!isOracleEnabled()) return;
    if (db.fiscalCnpjs.length > 0) return; // já populado

    let rows;
    try {
        // Try full query with NSU columns (WinThor >= 28.x)
        const result = await executeOracle(
            `SELECT CGC, MAX(RAZAOSOCIAL) AS RAZAOSOCIAL, MAX(UF) AS UF, MAX(CIDADE) AS CIDADE,
                    MAX(NSU) AS NSU, MAX(MAXNSUSEFAZ) AS MAXNSUSEFAZ,
                    MAX(STATUSULTCONSULTANSUSEFAZ) AS STATSNFE,
                    MAX(NSUCTE) AS NSUCTE, MAX(MAXNSUSEFAZCTE) AS MAXNSUSEFAZCTE,
                    MAX(STATUSULTCONSULTANSUSEFAZCTE) AS STATSCTE
             FROM PCFILIAL
             WHERE CGC IS NOT NULL
             GROUP BY CGC
             ORDER BY CGC`,
            {}, { outFormat: 4002 }
        );
        rows = result.rows || [];
    } catch (errFull) {
        // Fallback: query only the essential columns (CGC, RAZAOSOCIAL, UF, CIDADE)
        try {
            const result = await executeOracle(
                `SELECT CGC, MAX(RAZAOSOCIAL) AS RAZAOSOCIAL, MAX(UF) AS UF, MAX(CIDADE) AS CIDADE,
                        0 AS NSU, 0 AS MAXNSUSEFAZ, NULL AS STATSNFE,
                        0 AS NSUCTE, 0 AS MAXNSUSEFAZCTE, NULL AS STATSCTE
                 FROM PCFILIAL
                 WHERE CGC IS NOT NULL
                 GROUP BY CGC
                 ORDER BY CGC`,
                {}, { outFormat: 4002 }
            );
            rows = result.rows || [];
            console.warn("[seedFiscalCnpjs] Usando query simplificada (colunas NSU ausentes em PCFILIAL).");
        } catch (errSimple) {
            console.warn("[seedFiscalCnpjs] Erro ao consultar PCFILIAL:", errSimple.message);
            return;
        }
    }

    const agora = new Date().toISOString();
    let idx = 0;

    for (const row of rows) {
        const cnpjRaw = row.CGC;
        const cnpj = formatCnpj(cnpjRaw);
        if (!cnpj || cnpj.length < 11) continue;

        // evitar duplicata por CNPJ
        if (db.fiscalCnpjs.some(c => c.cnpj === cnpj)) continue;

        const id = nextId("FCN", db.fiscalCnpjs.length);
        const razao = capitalize(row.RAZAOSOCIAL) || "RODRIGUES IND. E COM. DE COLCHOES LTDA";
        const uf = (row.UF || "AM").trim();
        const cidade = capitalize(row.CIDADE) || "";

        db.fiscalCnpjs.push({
            id,
            cnpj,
            razaoSocial: razao,
            uf,
            cidade,
            ambiente: "PRODUCAO",
            monitoraNfe: true,
            monitoraCte: true,
            ativo: true,
            criadoEm: agora,
            atualizadoEm: agora,
        });

        // Controle NSU — NF-e
        const nsuNfe = Number(row.NSU ?? 0);
        const maxNsuNfe = Number(row.MAXNSUSEFAZ ?? 0);
        db.fiscalControleNsu.push({
            id: nextId("CNS", db.fiscalControleNsu.length),
            cnpj,
            tipoDfe: "NFE",
            ambiente: "PRODUCAO",
            ultimoNsu: nsuNfe,
            maxNsu: maxNsuNfe,
            statusConsulta: row.STATSNFE || "OK",
            ultimaConsultaEm: agora,
            criadoEm: agora,
        });

        // Controle NSU — CT-e
        const nsuCte = Number(row.NSUCTE ?? 0);
        const maxNsuCte = Number(row.MAXNSUSEFAZCTE ?? 0);
        db.fiscalControleNsu.push({
            id: nextId("CNS", db.fiscalControleNsu.length),
            cnpj,
            tipoDfe: "CTE",
            ambiente: "PRODUCAO",
            ultimoNsu: nsuCte,
            maxNsu: maxNsuCte,
            statusConsulta: row.STATSCTE || "OK",
            ultimaConsultaEm: agora,
            criadoEm: agora,
        });

        idx++;
    }

    console.log(`[seedFiscalCnpjs] ${idx} CNPJs populados de PCFILIAL.`);
}
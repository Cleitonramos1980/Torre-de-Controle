import oracledb from "oracledb";

const ORA_USER    = "U_CC4UJM_WI";
const ORA_PASS    = "AFT5L44D2Z56IZ3E65";
const ORA_CONN    = "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))";

oracledb.fetchAsString = [oracledb.CLOB];

let pool;
async function q(sql, binds = {}) {
    const conn = await pool.getConnection();
    try {
        const r = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return r.rows;
    } finally { await conn.close(); }
}

async function main() {
    pool = await oracledb.createPool({
        user: ORA_USER, password: ORA_PASS, connectString: ORA_CONN,
        poolMin: 1, poolMax: 3, poolAlias: "study"
    });
    console.log("=== Conectado ao Oracle ===\n");

    // 1. Colunas de PCLANC
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("1. ESTRUTURA DA PCLANC (Lançamentos de NF)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const colsLanc = await q(`
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
        FROM ALL_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCLANC' AND OWNER = 'U_CC4UJM_WI'
        ORDER BY COLUMN_ID
    `);
    colsLanc.forEach(c => {
        const tipo = c.DATA_TYPE === "NUMBER"
            ? `NUMBER(${c.DATA_PRECISION||'?'},${c.DATA_SCALE||0})`
            : `${c.DATA_TYPE}(${c.DATA_LENGTH})`;
        console.log(`  ${String(c.COLUMN_NAME).padEnd(30)} ${tipo.padEnd(25)} ${c.NULLABLE === 'N' ? 'NOT NULL' : ''}`);
    });

    // 2. Colunas de PCNFENT
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("2. ESTRUTURA DA PCNFENT (Cabeçalho de NF de Entrada)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const colsNfent = await q(`
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
        FROM ALL_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCNFENT' AND OWNER = 'U_CC4UJM_WI'
        ORDER BY COLUMN_ID
    `);
    colsNfent.forEach(c => {
        const tipo = c.DATA_TYPE === "NUMBER"
            ? `NUMBER(${c.DATA_PRECISION||'?'},${c.DATA_SCALE||0})`
            : `${c.DATA_TYPE}(${c.DATA_LENGTH})`;
        console.log(`  ${String(c.COLUMN_NAME).padEnd(30)} ${tipo.padEnd(25)} ${c.NULLABLE === 'N' ? 'NOT NULL' : ''}`);
    });

    // 3. Colunas de PCFORNEC (campos relevantes)
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("3. ESTRUTURA DA PCFORNEC (Cadastro de Fornecedores)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const colsForn = await q(`
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
        FROM ALL_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCFORNEC' AND OWNER = 'U_CC4UJM_WI'
        ORDER BY COLUMN_ID
    `);
    colsForn.forEach(c => {
        const tipo = c.DATA_TYPE === "NUMBER"
            ? `NUMBER(${c.DATA_PRECISION||'?'},${c.DATA_SCALE||0})`
            : `${c.DATA_TYPE}(${c.DATA_LENGTH})`;
        console.log(`  ${String(c.COLUMN_NAME).padEnd(30)} ${tipo.padEnd(25)} ${c.NULLABLE === 'N' ? 'NOT NULL' : ''}`);
    });

    // 4. Buscar exemplos reais de NF de serviço no último mês
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("4. EXEMPLOS REAIS — PCNFENT (últimos 60 dias, NF de serviço)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const nfents = await q(`
        SELECT n.NUMNOTA, n.CODFORNEC, f.FORNECEDOR, f.CGC,
               n.DTEMISSAO, n.DTENTRADA, n.VLTOTAL,
               n.VLISS, n.VLPIS, n.VLCOFINS, n.VLCSLL, n.VLIRPJ, n.VLINSS,
               n.VLBASISS, n.ALIQISS,
               n.CODCONTA, n.HISTORICO,
               n.VLRETISS, n.VLRETPIS, n.VLRETCOFINS, n.VLRETCSLL, n.VLRETIRPJ, n.VLRETINSS,
               n.ESPECIE, n.SERIE, n.CODFILIAL
        FROM PCNFENT n
        JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
        WHERE n.DTEMISSAO >= TRUNC(SYSDATE) - 60
          AND (n.VLISS > 0 OR n.VLPIS > 0 OR n.VLCOFINS > 0 OR n.ESPECIE = 'NFS')
          AND ROWNUM <= 10
        ORDER BY n.DTEMISSAO DESC
    `).catch(() => []);

    if (nfents.length === 0) {
        // Tentar sem filtro de serviço, pegar as mais recentes com qualquer imposto
        const nfents2 = await q(`
            SELECT n.NUMNOTA, n.CODFORNEC, f.FORNECEDOR, f.CGC,
                   n.DTEMISSAO, n.DTENTRADA, n.VLTOTAL,
                   n.VLISS, n.VLPIS, n.VLCOFINS, n.VLCSLL, n.VLIRPJ, n.VLINSS,
                   n.ESPECIE, n.SERIE, n.CODCONTA, n.HISTORICO, n.CODFILIAL
            FROM PCNFENT n
            JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
            WHERE n.DTEMISSAO >= TRUNC(SYSDATE) - 60
              AND ROWNUM <= 5
            ORDER BY n.DTEMISSAO DESC
        `).catch(() => []);
        nfents2.forEach(r => console.log(JSON.stringify(r, null, 2)));
    } else {
        nfents.forEach(r => console.log(JSON.stringify(r, null, 2)));
    }

    // 5. Lançamentos PCLANC para essas NFs
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("5. LANÇAMENTOS PCLANC — NFs de serviço recentes");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const lancs = await q(`
        SELECT l.NUMLANC, l.CODFORNEC, f.FORNECEDOR,
               l.NUMNOTA, l.VALOR, l.DTLANC, l.DTVENC,
               l.CODCONTA, l.HISTORICO, l.NUMPARC, l.TOTPARC,
               l.VLISS, l.VLPIS, l.VLCOFINS, l.VLCSLL, l.VLIRPJ, l.VLINSS,
               l.VLRETISS, l.VLRETPIS, l.VLRETCOFINS, l.VLRETCSLL, l.VLRETIRPJ, l.VLRETINSS,
               l.DTPAG, l.NUMPED, l.CODFILIAL, l.CODTIPODESPESA
        FROM PCLANC l
        JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
        WHERE l.DTLANC >= TRUNC(SYSDATE) - 60
          AND (l.VLISS > 0 OR l.VLPIS > 0 OR l.VLCOFINS > 0)
          AND ROWNUM <= 10
        ORDER BY l.DTLANC DESC
    `).catch(async (e) => {
        console.log("  Erro ao buscar com impostos:", e.message);
        // fallback sem filtro de impostos
        return await q(`
            SELECT l.NUMLANC, l.CODFORNEC, f.FORNECEDOR,
                   l.NUMNOTA, l.VALOR, l.DTLANC, l.DTVENC,
                   l.CODCONTA, l.HISTORICO, l.NUMPARC, l.TOTPARC,
                   l.DTPAG, l.NUMPED, l.CODFILIAL
            FROM PCLANC l
            JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
            WHERE l.DTLANC >= TRUNC(SYSDATE) - 60
              AND ROWNUM <= 10
            ORDER BY l.DTLANC DESC
        `).catch(e2 => { console.log("  Erro fallback:", e2.message); return []; });
    });
    lancs.forEach(r => console.log(JSON.stringify(r, null, 2)));

    // 6. Verificar se existe tabela de contas gerenciais
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("6. TABELAS DE CONTAS GERENCIAIS / PLANO DE CONTAS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const tabsConta = await q(`
        SELECT TABLE_NAME FROM ALL_TABLES
        WHERE OWNER = 'U_CC4UJM_WI'
          AND (TABLE_NAME LIKE 'PCCONTA%' OR TABLE_NAME LIKE 'PCPLANO%'
            OR TABLE_NAME LIKE '%CONTA%' OR TABLE_NAME LIKE 'PCTIPODESPESA%'
            OR TABLE_NAME LIKE 'PCTIPO%')
        ORDER BY TABLE_NAME
    `);
    console.log("  Tabelas encontradas:", tabsConta.map(t => t.TABLE_NAME).join(", "));

    // 7. PCCONTA - plano de contas
    const contasExist = tabsConta.find(t => t.TABLE_NAME === "PCCONTA");
    if (contasExist) {
        const contas = await q(`
            SELECT * FROM PCCONTA WHERE ROWNUM <= 20 ORDER BY CODCONTA
        `).catch(() => []);
        console.log("\n  PCCONTA (amostra):");
        contas.forEach(r => console.log("  ", JSON.stringify(r)));
    }

    // 8. Tipo de despesa
    const tipoDesp = tabsConta.find(t => t.TABLE_NAME === "PCTIPODESPESA");
    if (tipoDesp) {
        const tds = await q(`SELECT * FROM PCTIPODESPESA WHERE ROWNUM <= 30`).catch(() => []);
        console.log("\n  PCTIPODESPESA (amostra):");
        tds.forEach(r => console.log("  ", JSON.stringify(r)));
    }

    // 9. Verificar campos de impostos em PCLANC que realmente existem
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("7. CAMPOS DE IMPOSTOS EM PCLANC (verificação)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const impCols = colsLanc.filter(c =>
        /ISS|PIS|COF|CSLL|IRPJ|INSS|RET|ALIQ|TRIBUT|IMPOST|TAXA|DEDUCAO/i.test(c.COLUMN_NAME)
    );
    console.log("  Campos de tributos em PCLANC:");
    impCols.forEach(c => console.log(`    ${c.COLUMN_NAME}`));

    const impColsNfent = colsNfent.filter(c =>
        /ISS|PIS|COF|CSLL|IRPJ|INSS|RET|ALIQ|TRIBUT|IMPOST|TAXA|DEDUCAO/i.test(c.COLUMN_NAME)
    );
    console.log("\n  Campos de tributos em PCNFENT:");
    impColsNfent.forEach(c => console.log(`    ${c.COLUMN_NAME}`));

    // 10. Buscar um lançamento completo de NFS-e cruzando com nossa base
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("8. LANÇAMENTO COMPLETO — cruzando PCLANC + PCNFENT + PCFORNEC");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    // Pegar NFs que existem em PCNFENT e também em PCLANC
    const completos = await q(`
        SELECT
            f.CODFORNEC, f.FORNECEDOR, f.CGC,
            n.NUMNOTA, n.ESPECIE, n.SERIE,
            n.DTEMISSAO, n.DTENTRADA, n.VLTOTAL,
            n.VLISS, n.VLPIS, n.VLCOFINS, n.VLCSLL, n.VLIRPJ, n.VLINSS,
            n.VLRETISS, n.VLRETPIS, n.VLRETCOFINS, n.VLRETCSLL, n.VLRETIRPJ, n.VLRETINSS,
            n.VLBASISS, n.ALIQISS, n.CODCONTA AS CONTA_NFENT, n.HISTORICO AS HIST_NFENT,
            l.NUMLANC, l.VALOR, l.DTLANC, l.DTVENC,
            l.NUMPARC, l.TOTPARC, l.DTPAG,
            l.CODCONTA AS CONTA_LANC, l.HISTORICO AS HIST_LANC,
            l.CODTIPODESPESA
        FROM PCNFENT n
        JOIN PCLANC l ON l.NUMNOTA = n.NUMNOTA AND l.CODFORNEC = n.CODFORNEC
        JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
        WHERE n.DTEMISSAO >= TRUNC(SYSDATE) - 90
          AND ROWNUM <= 5
        ORDER BY n.DTEMISSAO DESC
    `).catch(e => { console.log("  Erro:", e.message); return []; });

    completos.forEach((r, i) => {
        console.log(`\n  --- EXEMPLO ${i+1} ---`);
        Object.entries(r).forEach(([k, v]) => {
            if (v !== null && v !== 0) console.log(`    ${k.padEnd(25)}: ${v}`);
        });
    });

    // 11. Verificar CODCONTA usadas para serviços
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("9. CONTAS GERENCIAIS MAIS USADAS EM PCLANC (serviços)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const contasUsadas = await q(`
        SELECT l.CODCONTA, COUNT(*) QTD, SUM(l.VALOR) TOTAL,
               MAX(l.HISTORICO) HIST_EX
        FROM PCLANC l
        WHERE l.DTLANC >= TRUNC(SYSDATE) - 365
        GROUP BY l.CODCONTA
        ORDER BY QTD DESC
        FETCH FIRST 20 ROWS ONLY
    `).catch(async () => {
        return await q(`
            SELECT l.CODCONTA, COUNT(*) QTD, SUM(l.VALOR) TOTAL
            FROM PCLANC l
            WHERE l.DTLANC >= TRUNC(SYSDATE) - 365
            GROUP BY l.CODCONTA
            ORDER BY QTD DESC
        `).catch(() => []);
    });
    contasUsadas.forEach(r => console.log(`    CONTA ${String(r.CODCONTA||'').padEnd(10)} | QTD: ${String(r.QTD).padEnd(6)} | TOTAL: R$ ${Number(r.TOTAL||0).toFixed(2).padStart(14)} | ${r.HIST_EX||''}`));

    // 12. PCCONTA detalhes das contas acima
    if (contasExist && contasUsadas.length > 0) {
        const codigos = contasUsadas.slice(0, 10).map(c => c.CODCONTA).filter(Boolean);
        const placeholders = codigos.map((_, i) => `:c${i}`).join(",");
        const binds = Object.fromEntries(codigos.map((c, i) => [`c${i}`, c]));
        const detContas = await q(`
            SELECT * FROM PCCONTA WHERE CODCONTA IN (${placeholders})
        `, binds).catch(() => []);
        console.log("\n  Detalhes das contas mais usadas:");
        detContas.forEach(r => console.log("  ", JSON.stringify(r)));
    }

    await pool.close(0);
    console.log("\n=== Estudo concluído ===");
}

main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });

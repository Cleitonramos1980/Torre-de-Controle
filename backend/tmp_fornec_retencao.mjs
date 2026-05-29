import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "tmp3"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Quem é o CODFORNEC nas contas de retenção de ISS (312009)?
// ─────────────────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════════════");
console.log("1. FORNECEDORES usados na conta 312009 — ISS RETIDO");
console.log("═══════════════════════════════════════════════════════════════════");
const issRetidos = await q(`
    SELECT l.CODFORNEC, f.FORNECEDOR, f.CGC, f.TIPOFORNEC,
           COUNT(*) QTD, SUM(l.VALOR) TOTAL,
           MAX(l.DTLANC) ULT_LANC,
           MAX(l.HISTORICO) EX_HIST
    FROM PCLANC l
    JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
    WHERE l.CODCONTA = 312009
      AND l.DTLANC >= TRUNC(SYSDATE) - 365
    GROUP BY l.CODFORNEC, f.FORNECEDOR, f.CGC, f.TIPOFORNEC
    ORDER BY QTD DESC
    FETCH FIRST 10 ROWS ONLY
`);
issRetidos.forEach(r => {
    console.log(`\n  CODFORNEC ${r.CODFORNEC} — ${r.FORNECEDOR}`);
    console.log(`    CNPJ: ${r.CGC} | Tipo: ${r.TIPOFORNEC}`);
    console.log(`    Lançamentos: ${r.QTD} | Total: R$ ${Number(r.TOTAL).toFixed(2)} | Ult: ${r.ULT_LANC?.toISOString?.().slice(0,10)}`);
    console.log(`    Ex histórico: ${r.EX_HIST}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Quem é o CODFORNEC nas contas de INSS retido (312040)?
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════════");
console.log("2. FORNECEDORES usados na conta 312040 — INSS RETIDO");
console.log("═══════════════════════════════════════════════════════════════════");
const inssRetidos = await q(`
    SELECT l.CODFORNEC, f.FORNECEDOR, f.CGC, f.TIPOFORNEC,
           COUNT(*) QTD, SUM(l.VALOR) TOTAL,
           MAX(l.DTLANC) ULT_LANC
    FROM PCLANC l
    JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
    WHERE l.CODCONTA = 312040
      AND l.DTLANC >= TRUNC(SYSDATE) - 365
    GROUP BY l.CODFORNEC, f.FORNECEDOR, f.CGC, f.TIPOFORNEC
    ORDER BY QTD DESC
    FETCH FIRST 10 ROWS ONLY
`);
inssRetidos.forEach(r => {
    console.log(`\n  CODFORNEC ${r.CODFORNEC} — ${r.FORNECEDOR}`);
    console.log(`    CNPJ: ${r.CGC} | Tipo: ${r.TIPOFORNEC}`);
    console.log(`    Lançamentos: ${r.QTD} | Total: R$ ${Number(r.TOTAL).toFixed(2)} | Ult: ${r.ULT_LANC?.toISOString?.().slice(0,10)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CSRF (PIS/COFINS/CSLL retidos) — contas 312036, 312037, 312038
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════════");
console.log("3. FORNECEDORES usados nas contas 312036/312037/312038 — PIS/COFINS/CSLL RETIDOS");
console.log("═══════════════════════════════════════════════════════════════════");
const csrfRetidos = await q(`
    SELECT l.CODCONTA, cc.CONTA,
           l.CODFORNEC, f.FORNECEDOR, f.CGC,
           COUNT(*) QTD, SUM(l.VALOR) TOTAL,
           MAX(l.DTLANC) ULT_LANC
    FROM PCLANC l
    JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
    JOIN PCCONTA cc ON cc.CODCONTA = l.CODCONTA
    WHERE l.CODCONTA IN (312036, 312037, 312038)
      AND l.DTLANC >= TRUNC(SYSDATE) - 365
    GROUP BY l.CODCONTA, cc.CONTA, l.CODFORNEC, f.FORNECEDOR, f.CGC
    ORDER BY l.CODCONTA, QTD DESC
    FETCH FIRST 20 ROWS ONLY
`);
csrfRetidos.forEach(r => {
    console.log(`\n  Conta ${r.CODCONTA} (${r.CONTA})`);
    console.log(`  CODFORNEC ${r.CODFORNEC} — ${r.FORNECEDOR} | CNPJ: ${r.CGC}`);
    console.log(`    Lançamentos: ${r.QTD} | Total: R$ ${Number(r.TOTAL).toFixed(2)} | Ult: ${r.ULT_LANC?.toISOString?.().slice(0,10)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. IRRF s/ serviço (312008 e outras contas de IR)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════════");
console.log("4. FORNECEDORES usados em contas de IRRF");
console.log("═══════════════════════════════════════════════════════════════════");
// primeiro descobrir as contas de IRRF ativas
const contasIR = await q(`
    SELECT c.CODCONTA, c.CONTA, COUNT(l.RECNUM) QTD
    FROM PCCONTA c
    LEFT JOIN PCLANC l ON l.CODCONTA = c.CODCONTA AND l.DTLANC >= TRUNC(SYSDATE) - 365
    WHERE UPPER(c.CONTA) LIKE '%IRRF%' OR UPPER(c.CONTA) LIKE '%IR%' AND UPPER(c.CONTA) LIKE '%RECOLH%'
    GROUP BY c.CODCONTA, c.CONTA
    HAVING COUNT(l.RECNUM) > 0
    ORDER BY QTD DESC
    FETCH FIRST 10 ROWS ONLY
`);
console.log("\n  Contas de IRRF com movimentação:");
contasIR.forEach(r => console.log(`    ${r.CODCONTA} — ${r.CONTA} (${r.QTD} lanç.)`));

if (contasIR.length > 0) {
    const codsIR = contasIR.map(r => r.CODCONTA);
    const placeholders = codsIR.map((_, i) => `:c${i}`).join(",");
    const binds = Object.fromEntries(codsIR.map((c2, i) => [`c${i}`, c2]));
    const irrfFornec = await q(`
        SELECT l.CODCONTA, l.CODFORNEC, f.FORNECEDOR, f.CGC,
               COUNT(*) QTD, SUM(l.VALOR) TOTAL, MAX(l.DTLANC) ULT_LANC
        FROM PCLANC l
        JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
        WHERE l.CODCONTA IN (${placeholders})
          AND l.DTLANC >= TRUNC(SYSDATE) - 365
        GROUP BY l.CODCONTA, l.CODFORNEC, f.FORNECEDOR, f.CGC
        ORDER BY l.CODCONTA, QTD DESC
        FETCH FIRST 20 ROWS ONLY
    `, binds);
    irrfFornec.forEach(r => {
        console.log(`\n  Conta ${r.CODCONTA} — CODFORNEC ${r.CODFORNEC} — ${r.FORNECEDOR} | CNPJ: ${r.CGC}`);
        console.log(`    Lançamentos: ${r.QTD} | Total: R$ ${Number(r.TOTAL).toFixed(2)} | Ult: ${r.ULT_LANC?.toISOString?.().slice(0,10)}`);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Rastrear um lançamento completo de serviço:
//    ver TODOS os PCLANC gerados para uma mesma NUMNOTA de serviço
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════════");
console.log("5. RASTREIO COMPLETO — todos os lançamentos de uma NF de serviço");
console.log("   (mostra qual CODFORNEC cada imposto vai)");
console.log("═══════════════════════════════════════════════════════════════════");

// Pegar uma NF de serviço com ISS no período recente
const nfRef = await q(`
    SELECT n.NUMNOTA, n.CODFORNEC, n.DTEMISSAO, n.VLTOTAL,
           n.VLISS, n.VLPIS, n.VLCOFINS, n.VLIRRF, n.VLCSRF
    FROM PCNFENT n
    WHERE n.DTEMISSAO >= TRUNC(SYSDATE) - 180
      AND n.VLISS > 0
      AND n.VLPIS > 0
      AND ROWNUM = 1
    ORDER BY n.DTEMISSAO DESC
`);

if (nfRef.length > 0) {
    const nf = nfRef[0];
    console.log(`\n  NF referência: ${nf.NUMNOTA} | Fornecedor: ${nf.CODFORNEC} | Emissão: ${nf.DTEMISSAO?.toISOString?.().slice(0,10)}`);
    console.log(`  Bruto: R$ ${nf.VLTOTAL} | ISS: ${nf.VLISS} | PIS: ${nf.VLPIS} | COFINS: ${nf.VLCOFINS}`);

    const todosLanc = await q(`
        SELECT l.RECNUM, l.CODFORNEC, f.FORNECEDOR, f.CGC,
               l.CODCONTA, cc.CONTA,
               l.VALOR, l.DTLANC, l.DTVENC, l.DTPAGTO,
               l.HISTORICO, l.NFSERVICO, l.TIPOLANC,
               l.VLISS, l.VLPIS, l.VLCOFINS, l.VLCSRF, l.VLIRRF
        FROM PCLANC l
        JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
        LEFT JOIN PCCONTA cc ON cc.CODCONTA = l.CODCONTA
        WHERE l.NUMNOTA = :numnota
          AND l.DTLANC >= ADD_MONTHS(TRUNC(:dt,'MM'), -1)
          AND l.DTLANC <= ADD_MONTHS(TRUNC(:dt,'MM'), 2)
        ORDER BY l.RECNUM
    `, { numnota: nf.NUMNOTA, dt: nf.DTEMISSAO });

    if (todosLanc.length > 0) {
        console.log(`\n  Todos os lançamentos gerados para NF ${nf.NUMNOTA}:`);
        todosLanc.forEach((l, i) => {
            console.log(`\n  [${i+1}] RECNUM ${l.RECNUM}`);
            console.log(`      CODFORNEC : ${l.CODFORNEC} — ${l.FORNECEDOR} (CNPJ: ${l.CGC})`);
            console.log(`      CODCONTA  : ${l.CODCONTA} — ${l.CONTA || '?'}`);
            console.log(`      VALOR     : R$ ${l.VALOR}`);
            console.log(`      DTLANC    : ${l.DTLANC?.toISOString?.().slice(0,10)}`);
            console.log(`      DTVENC    : ${l.DTVENC?.toISOString?.().slice(0,10)}`);
            console.log(`      DTPAGTO   : ${l.DTPAGTO?.toISOString?.().slice(0,10) || '-'}`);
            console.log(`      HISTORICO : ${l.HISTORICO}`);
            if (l.VLISS) console.log(`      VLISS     : ${l.VLISS}`);
            if (l.VLPIS) console.log(`      VLPIS     : ${l.VLPIS}`);
            if (l.VLCOFINS) console.log(`      VLCOFINS  : ${l.VLCOFINS}`);
        });
    } else {
        console.log("  Nenhum lançamento em PCLANC para essa NF (pode estar só em PCNFENT).");
        // Tentar pela chave completa sem restrição de data
        const todosLanc2 = await q(`
            SELECT l.RECNUM, l.CODFORNEC, f.FORNECEDOR,
                   l.CODCONTA, cc.CONTA, l.VALOR, l.DTLANC, l.HISTORICO
            FROM PCLANC l
            JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
            LEFT JOIN PCCONTA cc ON cc.CODCONTA = l.CODCONTA
            WHERE l.NUMNOTA = :numnota
            ORDER BY l.RECNUM
        `, { numnota: nf.NUMNOTA });
        todosLanc2.forEach(l => {
            console.log(`\n  RECNUM ${l.RECNUM} | CODFORNEC ${l.CODFORNEC} — ${l.FORNECEDOR}`);
            console.log(`    CODCONTA: ${l.CODCONTA} — ${l.CONTA||'?'} | VALOR: R$ ${l.VALOR} | DTLANC: ${l.DTLANC?.toISOString?.().slice(0,10)}`);
            console.log(`    HIST: ${l.HISTORICO}`);
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Buscar NF com MÚLTIPLOS lançamentos (título + retenções)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════════");
console.log("6. NFs com MÚLTIPLOS lançamentos em PCLANC (título + retenções)");
console.log("═══════════════════════════════════════════════════════════════════");
const nfsMulti = await q(`
    SELECT l.NUMNOTA, COUNT(DISTINCT l.CODFORNEC) FORNECS_DISTINTOS,
           COUNT(*) TOTAL_LANC, SUM(l.VALOR) SOMA_VALORES,
           MIN(l.DTLANC) DT_PRIM
    FROM PCLANC l
    WHERE l.DTLANC >= TRUNC(SYSDATE) - 365
      AND l.NFSERVICO = 'S'
    GROUP BY l.NUMNOTA
    HAVING COUNT(DISTINCT l.CODFORNEC) > 1
    ORDER BY TOTAL_LANC DESC
    FETCH FIRST 10 ROWS ONLY
`);
console.log(`\n  NFs de serviço com mais de 1 CODFORNEC nos lançamentos:`);
nfsMulti.forEach(r => {
    console.log(`    NF ${String(r.NUMNOTA).padEnd(10)} | ${r.FORNECS_DISTINTOS} fornecedores | ${r.TOTAL_LANC} lançamentos | Soma: R$ ${Number(r.SOMA_VALORES).toFixed(2)} | ${r.DT_PRIM?.toISOString?.().slice(0,10)}`);
});

if (nfsMulti.length > 0) {
    const nfEx = nfsMulti[0];
    console.log(`\n  Detalhe da NF ${nfEx.NUMNOTA} (exemplo):`);
    const detalhe = await q(`
        SELECT l.RECNUM, l.CODFORNEC, f.FORNECEDOR, f.CGC,
               l.CODCONTA, cc.CONTA,
               l.VALOR, l.DTLANC, l.DTVENC, l.HISTORICO
        FROM PCLANC l
        JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
        LEFT JOIN PCCONTA cc ON cc.CODCONTA = l.CODCONTA
        WHERE l.NUMNOTA = :numnota AND l.NFSERVICO = 'S'
        ORDER BY l.RECNUM
    `, { numnota: nfEx.NUMNOTA });
    detalhe.forEach((l, i) => {
        console.log(`\n    [${i+1}] RECNUM ${l.RECNUM}`);
        console.log(`        CODFORNEC : ${l.CODFORNEC} — ${l.FORNECEDOR} (${l.CGC})`);
        console.log(`        CODCONTA  : ${l.CODCONTA} — ${l.CONTA||'?'}`);
        console.log(`        VALOR     : R$ ${l.VALOR}`);
        console.log(`        DTLANC/VENC: ${l.DTLANC?.toISOString?.().slice(0,10)} / ${l.DTVENC?.toISOString?.().slice(0,10)}`);
        console.log(`        HISTORICO : ${l.HISTORICO}`);
    });
}

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");

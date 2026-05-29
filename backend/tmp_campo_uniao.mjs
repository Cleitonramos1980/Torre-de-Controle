import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "tmp4"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// ─────────────────────────────────────────────────────────────────────────────
// Pegar uma NF de serviço com ISS que tenha lançamento confirmado
// e inspecionar TODOS os campos de ligação
// ─────────────────────────────────────────────────────────────────────────────
console.log("1. Buscando NF de serviço com ISS e lançamento em PCLANC...");
const nfRef = await q(`
    SELECT n.NUMNOTA, n.CODFORNEC, n.NUMTRANSENT, n.DTEMISSAO, n.VLTOTAL, n.VLISS
    FROM PCNFENT n
    WHERE n.VLISS > 0
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 180
      AND EXISTS (
          SELECT 1 FROM PCLANC l
          WHERE l.CODCONTA = 312009
            AND l.DTLANC >= n.DTEMISSAO - 30
            AND l.DTLANC <= n.DTEMISSAO + 60
            AND l.VALOR = n.VLISS
      )
      AND ROWNUM = 1
    ORDER BY n.DTEMISSAO DESC
`);

if (nfRef.length === 0) {
    // fallback: pegar qualquer NF com ISS recente
    const nfRef2 = await q(`
        SELECT n.NUMNOTA, n.CODFORNEC, n.NUMTRANSENT, n.DTEMISSAO, n.VLTOTAL, n.VLISS
        FROM PCNFENT n
        WHERE n.VLISS > 0 AND n.DTEMISSAO >= TRUNC(SYSDATE) - 365
        AND ROWNUM = 1 ORDER BY n.DTEMISSAO DESC
    `);
    nfRef.push(...nfRef2);
}

const nf = nfRef[0];
console.log(`\n  NF escolhida: ${nf.NUMNOTA} | CODFORNEC: ${nf.CODFORNEC} | NUMTRANSENT: ${nf.NUMTRANSENT}`);
console.log(`  Emissão: ${nf.DTEMISSAO?.toISOString?.().slice(0,10)} | Total: ${nf.VLTOTAL} | ISS: ${nf.VLISS}`);

// ─────────────────────────────────────────────────────────────────────────────
// Inspecionar todos os campos "chave" do PCLANC para essa NF
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n2. Todos os campos de ligação em PCLANC para essa NF:");
const lancamentos = await q(`
    SELECT l.RECNUM,
           l.CODFORNEC, f.FORNECEDOR,
           l.NUMNOTA,
           l.NUMTRANSENT,
           l.NUMTRANSENTNF,
           l.RECNUMPRINC,
           l.NUMNEGOCIACAO,
           l.CODCONTA, cc.CONTA,
           l.VALOR, l.DTLANC,
           l.HISTORICO, l.NFSERVICO
    FROM PCLANC l
    JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
    LEFT JOIN PCCONTA cc ON cc.CODCONTA = l.CODCONTA
    WHERE l.NUMTRANSENTNF = :trans
       OR l.NUMTRANSENT = :trans
    ORDER BY l.RECNUM
`, { trans: nf.NUMTRANSENT });

console.log(`\n  Busca por NUMTRANSENT/NUMTRANSENTNF = ${nf.NUMTRANSENT}:`);
if (lancamentos.length > 0) {
    lancamentos.forEach((l, i) => {
        console.log(`\n  [${i+1}] RECNUM ${l.RECNUM}`);
        console.log(`       CODFORNEC    : ${l.CODFORNEC} — ${l.FORNECEDOR}`);
        console.log(`       NUMNOTA      : ${l.NUMNOTA}`);
        console.log(`       NUMTRANSENT  : ${l.NUMTRANSENT}`);
        console.log(`       NUMTRANSENTNF: ${l.NUMTRANSENTNF}`);
        console.log(`       RECNUMPRINC  : ${l.RECNUMPRINC}`);
        console.log(`       NUMNEGOCIACAO: ${l.NUMNEGOCIACAO}`);
        console.log(`       CODCONTA     : ${l.CODCONTA} — ${l.CONTA||'?'}`);
        console.log(`       VALOR        : R$ ${l.VALOR}`);
        console.log(`       DTLANC       : ${l.DTLANC?.toISOString?.().slice(0,10)}`);
        console.log(`       HISTORICO    : ${l.HISTORICO}`);
    });
} else {
    console.log("  Nenhum resultado por NUMTRANSENT. Tentando RECNUMPRINC...");
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificar especificamente o lançamento do ISS (CODCONTA 312009)
// e seus campos que referenciam o título principal
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n3. Lançamento ISS (conta 312009) — campos de referência:");
const issLanc = await q(`
    SELECT l.RECNUM, l.CODFORNEC, f.FORNECEDOR,
           l.NUMNOTA, l.NUMTRANSENT, l.NUMTRANSENTNF,
           l.RECNUMPRINC, l.NUMNEGOCIACAO,
           l.VALOR, l.DTLANC, l.DTVENC, l.HISTORICO
    FROM PCLANC l
    JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
    WHERE l.CODCONTA = 312009
      AND l.DTLANC >= TRUNC(SYSDATE) - 90
      AND ROWNUM <= 5
    ORDER BY l.DTLANC DESC
`);
issLanc.forEach((l, i) => {
    console.log(`\n  [${i+1}] ISS RECNUM=${l.RECNUM}`);
    console.log(`       CODFORNEC    : ${l.CODFORNEC} — ${l.FORNECEDOR}`);
    console.log(`       NUMNOTA      : ${l.NUMNOTA}`);
    console.log(`       NUMTRANSENT  : ${l.NUMTRANSENT}`);
    console.log(`       NUMTRANSENTNF: ${l.NUMTRANSENTNF}`);
    console.log(`       RECNUMPRINC  : ${l.RECNUMPRINC}`);
    console.log(`       NUMNEGOCIACAO: ${l.NUMNEGOCIACAO}`);
    console.log(`       VALOR        : R$ ${l.VALOR}`);
    console.log(`       DTLANC       : ${l.DTLANC?.toISOString?.().slice(0,10)}`);
    console.log(`       HISTORICO    : ${l.HISTORICO}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Para cada ISS acima, ver o título principal via RECNUMPRINC ou NUMTRANSENTNF
// ─────────────────────────────────────────────────────────────────────────────
if (issLanc.length > 0) {
    const iss = issLanc[0];
    console.log(`\n\n4. Rastreando título principal do ISS RECNUM=${iss.RECNUM}:`);

    if (iss.RECNUMPRINC) {
        const princ = await q(`
            SELECT l.RECNUM, l.CODFORNEC, f.FORNECEDOR, l.NUMNOTA,
                   l.NUMTRANSENT, l.NUMTRANSENTNF, l.CODCONTA, cc.CONTA,
                   l.VALOR, l.HISTORICO
            FROM PCLANC l
            JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
            LEFT JOIN PCCONTA cc ON cc.CODCONTA = l.CODCONTA
            WHERE l.RECNUM = :rec
        `, { rec: iss.RECNUMPRINC });
        princ.forEach(l => {
            console.log(`\n  Título principal (via RECNUMPRINC=${iss.RECNUMPRINC}):`);
            console.log(`    CODFORNEC    : ${l.CODFORNEC} — ${l.FORNECEDOR}`);
            console.log(`    NUMNOTA      : ${l.NUMNOTA}`);
            console.log(`    NUMTRANSENT  : ${l.NUMTRANSENT}`);
            console.log(`    NUMTRANSENTNF: ${l.NUMTRANSENTNF}`);
            console.log(`    CODCONTA     : ${l.CODCONTA} — ${l.CONTA||'?'}`);
            console.log(`    VALOR        : R$ ${l.VALOR}`);
            console.log(`    HISTORICO    : ${l.HISTORICO}`);
        });
    }

    if (iss.NUMTRANSENTNF) {
        console.log(`\n  Todos os lançamentos com NUMTRANSENTNF=${iss.NUMTRANSENTNF}:`);
        const byTrans = await q(`
            SELECT l.RECNUM, l.CODFORNEC, f.FORNECEDOR, l.NUMNOTA,
                   l.CODCONTA, cc.CONTA, l.VALOR, l.DTLANC, l.HISTORICO
            FROM PCLANC l
            JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
            LEFT JOIN PCCONTA cc ON cc.CODCONTA = l.CODCONTA
            WHERE l.NUMTRANSENTNF = :t
            ORDER BY l.RECNUM
        `, { t: iss.NUMTRANSENTNF });
        byTrans.forEach((l, i) => {
            console.log(`\n    [${i+1}] RECNUM=${l.RECNUM} | CODFORNEC=${l.CODFORNEC} — ${l.FORNECEDOR}`);
            console.log(`        CODCONTA: ${l.CODCONTA} — ${l.CONTA||'?'} | VALOR: R$ ${l.VALOR}`);
            console.log(`        HISTORICO: ${l.HISTORICO}`);
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Verificar PCNFENT.NUMTRANSENT e como ela liga com PCLANC.NUMTRANSENTNF
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n5. PCNFENT.NUMTRANSENT ↔ PCLANC.NUMTRANSENTNF (verificação cruzada):");
const cruzamento = await q(`
    SELECT n.NUMNOTA, n.CODFORNEC, fn.FORNECEDOR,
           n.NUMTRANSENT AS NF_NUMTRANSENT,
           n.VLISS, n.DTEMISSAO,
           COUNT(l.RECNUM) TOTAL_LANC,
           COUNT(DISTINCT l.CODFORNEC) FORNECS_DISTINTOS,
           SUM(CASE WHEN l.CODCONTA = 312009 THEN 1 ELSE 0 END) LANC_ISS,
           SUM(CASE WHEN l.CODCONTA = 312040 THEN 1 ELSE 0 END) LANC_INSS,
           SUM(CASE WHEN l.CODCONTA IN (312036,312037,312038) THEN 1 ELSE 0 END) LANC_CSRF
    FROM PCNFENT n
    JOIN PCFORNEC fn ON fn.CODFORNEC = n.CODFORNEC
    JOIN PCLANC l ON l.NUMTRANSENTNF = n.NUMTRANSENT
    WHERE n.VLISS > 0
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 180
    GROUP BY n.NUMNOTA, n.CODFORNEC, fn.FORNECEDOR, n.NUMTRANSENT, n.VLISS, n.DTEMISSAO
    ORDER BY n.DTEMISSAO DESC
    FETCH FIRST 10 ROWS ONLY
`);
console.log(`\n  NFs onde PCNFENT.NUMTRANSENT = PCLANC.NUMTRANSENTNF:`);
cruzamento.forEach(r => {
    console.log(`\n  NF ${r.NUMNOTA} | ${r.FORNECEDOR} | NUMTRANSENT=${r.NF_NUMTRANSENT}`);
    console.log(`    ISS: R$ ${r.VLISS} | Emissão: ${r.DTEMISSAO?.toISOString?.().slice(0,10)}`);
    console.log(`    Total lançamentos: ${r.TOTAL_LANC} | Fornecedores distintos: ${r.FORNECS_DISTINTOS}`);
    console.log(`    Lançamentos ISS: ${r.LANC_ISS} | INSS: ${r.LANC_INSS} | CSRF: ${r.LANC_CSRF}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Verificar RECNUMPRINC — o lançamento de ISS aponta para o título?
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n\n6. ISS lançamentos — RECNUMPRINC aponta para o título do prestador?");
const issComPrinc = await q(`
    SELECT l.RECNUM, l.CODFORNEC, l.NUMNOTA,
           l.RECNUMPRINC,
           l.NUMTRANSENTNF, l.NUMTRANSENT,
           l.VALOR,
           p.RECNUM AS PRINC_RECNUM,
           p.CODFORNEC AS PRINC_CODFORNEC,
           fp.FORNECEDOR AS PRINC_FORNECEDOR,
           p.CODCONTA AS PRINC_CONTA,
           p.VALOR AS PRINC_VALOR
    FROM PCLANC l
    LEFT JOIN PCLANC p ON p.RECNUM = l.RECNUMPRINC
    LEFT JOIN PCFORNEC fp ON fp.CODFORNEC = p.CODFORNEC
    WHERE l.CODCONTA = 312009
      AND l.DTLANC >= TRUNC(SYSDATE) - 90
      AND l.RECNUMPRINC IS NOT NULL
      AND ROWNUM <= 5
    ORDER BY l.DTLANC DESC
`);
issComPrinc.forEach((l, i) => {
    console.log(`\n  [${i+1}] ISS RECNUM=${l.RECNUM} | NUMNOTA=${l.NUMNOTA} | NUMTRANSENTNF=${l.NUMTRANSENTNF}`);
    console.log(`       RECNUMPRINC=${l.RECNUMPRINC} → PRINC_CODFORNEC=${l.PRINC_CODFORNEC} — ${l.PRINC_FORNECEDOR}`);
    console.log(`       Conta principal: ${l.PRINC_CONTA} | Valor principal: R$ ${l.PRINC_VALOR}`);
    console.log(`       Valor ISS: R$ ${l.VALOR}`);
});

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");

import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "tmp5"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// 1. Ver exemplo completo de PCNFENT de serviço — todos campos preenchidos
console.log("=== PCNFENT — exemplo real completo (NF de serviço com ISS) ===");
const nfEx = await q(`
    SELECT n.*, f.FORNECEDOR, f.CGC, f.PERCISS, f.PERCINSS, f.PERCIRRF,
           f.PERCCSRF, f.CODCONTAISS, f.CODCONTAINSS, f.TIPOPESSOA, f.SIMPLESNACIONAL,
           f.INSCMUNICIP, f.CODPARCELA
    FROM PCNFENT n
    JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
    WHERE n.VLISS > 0
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 180
      AND ROWNUM = 1
    ORDER BY n.DTEMISSAO DESC
`);
if (nfEx.length > 0) {
    const r = nfEx[0];
    // Mostrar apenas campos preenchidos
    for (const [k, v] of Object.entries(r)) {
        if (v !== null && v !== 0 && v !== '' && v !== 'N' && v !== '0')
            console.log(`  ${k.padEnd(32)}: ${v instanceof Date ? v.toISOString().slice(0,10) : v}`);
    }
}

// 2. Ver PCLANC título + retenção ISS — todos campos
console.log("\n\n=== PCLANC — título principal de uma NF de serviço ===");
const lancEx = await q(`
    SELECT l.*
    FROM PCLANC l
    WHERE l.NFSERVICO = 'S'
      AND l.DTLANC >= TRUNC(SYSDATE) - 90
      AND l.RECNUM = l.RECNUMPRINC
      AND ROWNUM = 1
    ORDER BY l.DTLANC DESC
`);
if (lancEx.length > 0) {
    const r = lancEx[0];
    for (const [k, v] of Object.entries(r)) {
        if (v !== null && v !== 0 && v !== '' && v !== 'N')
            console.log(`  ${k.padEnd(32)}: ${v instanceof Date ? v.toISOString().slice(0,10) : v}`);
    }
}

// 3. Verificar se DTVENC existe no XML / PCNFENT
console.log("\n\n=== PRAZO DE PAGAMENTO — como o WinThor determina o vencimento? ===");
const prazo = await q(`
    SELECT f.CODFORNEC, f.FORNECEDOR,
           f.PRAZO1, f.PRAZO2, f.PRAZO3, f.PRAZO4, f.PRAZO5, f.PRAZO6,
           f.CODPARCELA,
           f.PERCISS, f.PERCINSS
    FROM PCFORNEC f
    WHERE (f.PERCISS > 0 OR f.PERCINSS > 0)
      AND f.EXCLUIDO <> 'S'
      AND (f.PRAZO1 IS NOT NULL OR f.CODPARCELA IS NOT NULL)
      AND ROWNUM <= 8
    ORDER BY f.CODFORNEC
`);
prazo.forEach(r => {
    console.log(`\n  CODFORNEC ${r.CODFORNEC} — ${r.FORNECEDOR}`);
    console.log(`    PRAZO1=${r.PRAZO1||'-'} PRAZO2=${r.PRAZO2||'-'} PRAZO3=${r.PRAZO3||'-'}`);
    console.log(`    CODPARCELA=${r.CODPARCELA||'-'} | ISS=${r.PERCISS}% | INSS=${r.PERCINSS}%`);
});

// 4. CODFISCAL — qual CFOP usado para serviços?
console.log("\n\n=== CODFISCAL (CFOP) usado em NFs de serviço ===");
const cfops = await q(`
    SELECT n.CODFISCAL, COUNT(*) QTD
    FROM PCNFENT n
    WHERE n.VLISS > 0
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 365
    GROUP BY n.CODFISCAL
    ORDER BY QTD DESC
    FETCH FIRST 5 ROWS ONLY
`);
cfops.forEach(r => console.log(`  CODFISCAL=${r.CODFISCAL} | ${r.QTD} notas`));

// 5. CODCONT — conta financeira do fornecedor na PCNFENT
console.log("\n\n=== CODCONT — de onde vem esse campo em PCNFENT? ===");
const codcont = await q(`
    SELECT n.CODFORNEC, f.FORNECEDOR, f.CGC,
           n.CODCONT AS NF_CODCONT,
           n.VLTOTAL, n.VLISS
    FROM PCNFENT n
    JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
    WHERE n.VLISS > 0
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 90
      AND ROWNUM <= 5
    ORDER BY n.DTEMISSAO DESC
`);
codcont.forEach(r => {
    console.log(`  ${r.FORNECEDOR} | PCNFENT.CODCONT=${r.NF_CODCONT} | CNPJ: ${r.CGC}`);
});

// 6. CODCONTSERV — conta gerencial do serviço em PCNFENT — vem do fornecedor ou manual?
console.log("\n\n=== CODCONTSERV — conta gerencial do serviço ===");
const codcontserv = await q(`
    SELECT n.CODFORNEC, f.FORNECEDOR,
           n.CODCONTSERV, cc.CONTA AS NOME_CONTA,
           n.NUMNOTA, n.VLTOTAL
    FROM PCNFENT n
    JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
    LEFT JOIN PCCONTA cc ON cc.CODCONTA = n.CODCONTSERV
    WHERE n.VLISS > 0
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 180
      AND n.CODCONTSERV IS NOT NULL
      AND ROWNUM <= 8
    ORDER BY n.DTEMISSAO DESC
`);
codcontserv.forEach(r => {
    console.log(`  CODFORNEC=${r.CODFORNEC} | ${r.FORNECEDOR}`);
    console.log(`    CODCONTSERV=${r.CODCONTSERV} — ${r.NOME_CONTA||'?'} | NF ${r.NUMNOTA} | R$ ${r.VLTOTAL}`);
});

// 7. CODFILIAL — como é determinada?
console.log("\n\n=== CODFILIAL nas NFs de serviço ===");
const filiais = await q(`
    SELECT n.CODFILIAL, COUNT(*) QTD, SUM(n.VLTOTAL) TOTAL
    FROM PCNFENT n
    WHERE n.VLISS > 0
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 365
    GROUP BY n.CODFILIAL
    ORDER BY QTD DESC
`);
filiais.forEach(r => console.log(`  CODFILIAL=${r.CODFILIAL} | ${r.QTD} notas | R$ ${Number(r.TOTAL||0).toFixed(2)}`));

// 8. Nossa base de NFS-e Tomadas — campos disponíveis
console.log("\n\n=== CAMPOS DISPONÍVEIS NAS NFS-e TOMADAS (sistema Torre de Controle) ===");
// Buscar amostra do Oracle onde salvamos as nfseTomadas
const nossaBase = await q(`
    SELECT n.*
    FROM NFSE_TOMADAS n
    WHERE ROWNUM <= 3
    ORDER BY n.CRIADO_EM DESC
`).catch(async () => {
    // Tentar nome alternativo
    return await q(`
        SELECT TABLE_NAME FROM ALL_TABLES
        WHERE TABLE_NAME LIKE '%NFSE%' OR TABLE_NAME LIKE '%TOMADA%'
    `);
});
console.log("  Resultado:", JSON.stringify(nossaBase?.slice?.(0,2) || nossaBase, null, 2).slice(0, 1000));

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");

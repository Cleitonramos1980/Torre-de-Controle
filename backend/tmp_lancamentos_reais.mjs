import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "tmp2"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// 1. Exemplos reais PCLANC com ISS ou flag nfservico
console.log("=== PCLANC — Lançamentos com ISS (serviços) ===");
const lancServ = await q(`
    SELECT l.RECNUM, l.CODFORNEC, l.HISTORICO, l.NUMNOTA, l.VALOR,
           l.DTLANC, l.DTEMISSAO, l.DTVENC, l.DTPAGTO,
           l.CODCONTA,
           l.VLISS, l.VLINSS, l.VLPIS, l.VLCOFINS, l.VLCSRF,
           l.VLIRRF, l.VLSESTSENAT, l.VLINSSTOMADOR,
           l.NFSERVICO, l.CODFILIAL, l.TIPOLANC,
           l.VLBASEIR, l.VLBASEPCC,
           f.FORNECEDOR, f.CGC
    FROM PCLANC l
    JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
    WHERE l.DTLANC >= TRUNC(SYSDATE) - 180
      AND (l.VLISS > 0 OR l.NFSERVICO = 'S')
      AND ROWNUM <= 5
    ORDER BY l.DTLANC DESC
`);
lancServ.forEach((r, i) => {
    console.log(`\n--- LANÇAMENTO ${i+1} ---`);
    Object.entries(r).forEach(([k, v]) => { if (v !== null && v !== 0) console.log(`  ${k.padEnd(25)}: ${v instanceof Date ? v.toISOString().slice(0,10) : v}`); });
});

// 2. Exemplos PCNFENT com ISS
console.log("\n\n=== PCNFENT — NFs com ISS (últimos 180 dias) ===");
const nfents = await q(`
    SELECT n.NUMNOTA, n.ESPECIE, n.SERIE, n.CODFORNEC,
           n.DTEMISSAO, n.DTENT, n.VLTOTAL,
           n.VLISS, n.VLINSS, n.VLPIS, n.VLCOFINS, n.VLIRRF, n.VLSESTSENAT, n.VLCSRF,
           n.ALIQISSRET, n.PERCISS, n.PERCINSS, n.PERCCSRF,
           n.VLBASECALCRETENCAOISS, n.VLISSRETIDOTOMADOR,
           n.CODCONT, n.CODFILIAL, n.ROTINALANC,
           n.CODCONTSERV, n.CODSERVISS,
           f.FORNECEDOR, f.CGC
    FROM PCNFENT n
    JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
    WHERE n.DTEMISSAO >= TRUNC(SYSDATE) - 180
      AND n.VLISS > 0
      AND ROWNUM <= 5
    ORDER BY n.DTEMISSAO DESC
`);
nfents.forEach((r, i) => {
    console.log(`\n--- NF ${i+1} ---`);
    Object.entries(r).forEach(([k, v]) => { if (v !== null && v !== 0) console.log(`  ${k.padEnd(25)}: ${v instanceof Date ? v.toISOString().slice(0,10) : v}`); });
});

// 3. Cruzar PCLANC + PCNFENT para NFs de serviço (sem colunas inexistentes)
console.log("\n\n=== LANÇAMENTO COMPLETO — PCLANC + PCNFENT + PCFORNEC (serviços) ===");
const completos = await q(`
    SELECT
        f.CODFORNEC, f.FORNECEDOR, f.CGC,
        f.PERCISS AS FORNEC_PERCISS, f.PERCINSS AS FORNEC_PERCINSS,
        f.PERCIRRF AS FORNEC_PERCIRRF, f.PERCCSRF AS FORNEC_PERCCSRF,
        f.CODCONTAISS, f.CODCONTAINSS,
        n.NUMNOTA, n.ESPECIE, n.DTEMISSAO, n.DTENT, n.VLTOTAL,
        n.VLISS AS NF_VLISS, n.VLINSS AS NF_VLINSS,
        n.VLPIS AS NF_VLPIS, n.VLCOFINS AS NF_VLCOFINS,
        n.VLIRRF AS NF_VLIRRF, n.VLSESTSENAT AS NF_SESTSENAT,
        n.VLCSRF AS NF_VLCSRF,
        n.VLISSRETIDOTOMADOR, n.VLBASECALCRETENCAOISS,
        n.PERCISS AS NF_PERCISS, n.ALIQISSRET,
        n.CODCONT, n.CODCONTSERV,
        l.RECNUM, l.VALOR AS LANC_VALOR, l.DTLANC, l.DTVENC, l.DTPAGTO,
        l.CODCONTA AS LANC_CONTA,
        l.HISTORICO, l.VLISS AS LANC_VLISS, l.VLINSS AS LANC_VLINSS,
        l.VLPIS AS LANC_VLPIS, l.VLCOFINS AS LANC_VLCOFINS,
        l.VLIRRF AS LANC_VLIRRF, l.VLCSRF AS LANC_VLCSRF,
        l.VLSESTSENAT AS LANC_SESTSENAT, l.VLINSSTOMADOR,
        l.NFSERVICO, l.TIPOLANC,
        l.VLBASEIR, l.VLBASEPCC
    FROM PCNFENT n
    JOIN PCLANC l ON l.NUMNOTA = n.NUMNOTA AND l.CODFORNEC = n.CODFORNEC
    JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
    WHERE n.DTEMISSAO >= TRUNC(SYSDATE) - 180
      AND n.VLISS > 0
      AND ROWNUM <= 3
    ORDER BY n.DTEMISSAO DESC
`);
completos.forEach((r, i) => {
    console.log(`\n\n============================================================`);
    console.log(`  EXEMPLO COMPLETO ${i+1}`);
    console.log(`============================================================`);
    Object.entries(r).forEach(([k, v]) => {
        if (v !== null && v !== 0 && v !== '' && v !== 'N')
            console.log(`  ${k.padEnd(30)}: ${v instanceof Date ? v.toISOString().slice(0,10) : v}`);
    });
});

// 4. Contas de serviços tipicas (baseado nos lançamentos encontrados)
console.log("\n\n=== PCCONTA — Contas de Serviços ===");
const contasServ = await q(`
    SELECT c.CODCONTA, c.CONTA, c.GRUPOCONTA, c.TIPO, c.CONTACONTABIL, c.FIXAVARIAVEL
    FROM PCCONTA c
    WHERE UPPER(c.CONTA) LIKE '%SERVI%'
       OR UPPER(c.CONTA) LIKE '%ALUGUEL%'
       OR UPPER(c.CONTA) LIKE '%INTERNET%'
       OR UPPER(c.CONTA) LIKE '%LUZ%'
       OR UPPER(c.CONTA) LIKE '%AGUA%'
       OR UPPER(c.CONTA) LIKE '%ISS%'
       OR UPPER(c.CONTA) LIKE '%INSS%'
    ORDER BY c.CODCONTA
`);
contasServ.forEach(r => console.log(`  ${String(r.CODCONTA).padEnd(10)} | ${String(r.TIPO||'?').padEnd(4)} | ${String(r.CONTA||'').padEnd(50)} | Contábil: ${r.CONTACONTABIL||''}`));

// 5. Exemplo de fornecedor prestador de serviço
console.log("\n\n=== PCFORNEC — Fornecedores com parâmetros de ISS ===");
const fornsServ = await q(`
    SELECT f.CODFORNEC, f.FORNECEDOR, f.CGC, f.TIPOFORNEC,
           f.PERCISS, f.PERCINSS, f.PERCIRRF, f.PERCCSRF,
           f.CODCONTAISS, f.CODCONTAINSS, f.CODCONTAIRRF, f.CODCONTACSRF,
           f.INSCMUNICIP, f.TIPOPESSOA, f.SIMPLESNACIONAL
    FROM PCFORNEC f
    WHERE (f.PERCISS > 0 OR f.PERCINSS > 0)
      AND f.EXCLUIDO <> 'S'
      AND ROWNUM <= 10
    ORDER BY f.CODFORNEC
`);
fornsServ.forEach(r => {
    console.log(`\n  CODFORNEC ${r.CODFORNEC} — ${r.FORNECEDOR} | CNPJ: ${r.CGC}`);
    console.log(`    ISS: ${r.PERCISS||0}% | INSS: ${r.PERCINSS||0}% | IRRF: ${r.PERCIRRF||0}% | CSRF: ${r.PERCCSRF||0}%`);
    console.log(`    Conta ISS: ${r.CODCONTAISS||'-'} | Conta INSS: ${r.CODCONTAINSS||'-'} | Tipo: ${r.TIPOPESSOA||'-'} | Simples: ${r.SIMPLESNACIONAL||'N'}`);
});

await c.close();
await pool.close(0);

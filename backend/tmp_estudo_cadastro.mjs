import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 3, poolAlias: "estudo"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// ═══════════════════════════════════════════════════════════════
// BLOCO 1 — CAMPOS OBRIGATÓRIOS DO PCFORNEC
// ═══════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════");
console.log("1. CAMPOS NOT NULL em PCFORNEC (obrigatórios)");
console.log("═══════════════════════════════════════════════════════════════");
const camposObrig = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, DATA_DEFAULT
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCFORNEC' AND OWNER = 'U_CC4UJM_WI'
      AND NULLABLE = 'N'
    ORDER BY COLUMN_ID
`);
camposObrig.forEach(r => {
    const tipo = r.DATA_TYPE === 'NUMBER'
        ? `NUMBER(${r.DATA_PRECISION||'?'},${r.DATA_SCALE||0})`
        : `${r.DATA_TYPE}(${r.DATA_LENGTH})`;
    console.log(`  ${String(r.COLUMN_NAME).padEnd(20)} ${tipo.padEnd(20)} DEFAULT: ${r.DATA_DEFAULT||'-'}`);
});

// ═══════════════════════════════════════════════════════════════
// BLOCO 2 — FORNECEDORES PRESTADORES RECENTES (para ver o padrão de cadastro)
// ═══════════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("2. FORNECEDORES PRESTADORES cadastrados recentemente (PERCISS > 0)");
console.log("═══════════════════════════════════════════════════════════════");
const fornsRecentes = await q(`
    SELECT f.CODFORNEC, f.FORNECEDOR, f.CGC, f.TIPOPESSOA, f.TIPOFORNEC,
           f.ENDER, f.BAIRRO, f.CIDADE, f.ESTADO, f.CEP, f.CODMUNICIPIO,
           f.PERCISS, f.PERCINSS, f.PERCIRRF, f.PERCCSRF,
           f.CODCONTAISS, f.CODCONTAINSS, f.CODCONTAIRRF, f.CODCONTACSRF,
           f.INSCMUNICIP, f.SIMPLESNACIONAL, f.CODPARCELA,
           f.DTCADASTRO, f.EXCLUIDO
    FROM PCFORNEC f
    WHERE (f.PERCISS > 0 OR f.PERCINSS > 0)
      AND f.EXCLUIDO <> 'S'
      AND f.DTCADASTRO >= TRUNC(SYSDATE) - 365
    ORDER BY f.DTCADASTRO DESC
    FETCH FIRST 10 ROWS ONLY
`);
fornsRecentes.forEach((r, i) => {
    console.log(`\n  [${i+1}] CODFORNEC ${r.CODFORNEC} — ${r.FORNECEDOR}`);
    console.log(`       CGC: ${r.CGC} | Tipo Pessoa: ${r.TIPOPESSOA} | Tipo Fornec: ${r.TIPOFORNEC}`);
    console.log(`       Endereço: ${r.ENDER||'-'}, ${r.BAIRRO||'-'}, ${r.CIDADE||'-'}-${r.ESTADO||'-'}, CEP: ${r.CEP||'-'}`);
    console.log(`       CODMUNICIPIO: ${r.CODMUNICIPIO||'-'}`);
    console.log(`       ISS: ${r.PERCISS||0}% | INSS: ${r.PERCINSS||0}% | IRRF: ${r.PERCIRRF||0}% | CSRF: ${r.PERCCSRF||0}%`);
    console.log(`       Conta ISS: ${r.CODCONTAISS||'-'} | Conta INSS: ${r.CODCONTAINSS||'-'}`);
    console.log(`       Simples: ${r.SIMPLESNACIONAL||'N'} | InscMunic: ${r.INSCMUNICIP||'-'} | CODPARCELA: ${r.CODPARCELA||'-'}`);
    console.log(`       Cadastrado em: ${r.DTCADASTRO?.toISOString?.().slice(0,10)}`);
});

// ═══════════════════════════════════════════════════════════════
// BLOCO 3 — CODMUNICIPIO: como é determinado no cadastro?
// ═══════════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("3. CODMUNICIPIO — tabela de municípios no WinThor");
console.log("═══════════════════════════════════════════════════════════════");
const tabMunic = await q(`
    SELECT TABLE_NAME FROM ALL_TABLES
    WHERE OWNER = 'U_CC4UJM_WI'
      AND (TABLE_NAME LIKE '%MUNIC%' OR TABLE_NAME LIKE '%CIDADE%' OR TABLE_NAME LIKE 'PCCIDADE%')
    ORDER BY TABLE_NAME
`);
console.log("  Tabelas:", tabMunic.map(t=>t.TABLE_NAME).join(", "));

// buscar a tabela de cidades
const tabCidade = tabMunic.find(t => t.TABLE_NAME.includes('CIDADE') || t.TABLE_NAME.includes('MUNIC'));
if (tabCidade) {
    const cidades = await q(`SELECT * FROM ${tabCidade.TABLE_NAME} WHERE ROWNUM <= 5`);
    console.log("  Colunas:", Object.keys(cidades[0]||{}).join(", "));
    cidades.forEach(r => console.log("  ", JSON.stringify(r)));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 4 — CODPARCELA: tabela de parcelamentos
// ═══════════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("4. CODPARCELA — parcelamentos padrão para fornecedores de serviço");
console.log("═══════════════════════════════════════════════════════════════");
const tabParcela = await q(`
    SELECT TABLE_NAME FROM ALL_TABLES
    WHERE OWNER = 'U_CC4UJM_WI' AND TABLE_NAME LIKE 'PCPARCELA%'
`);
console.log("  Tabelas:", tabParcela.map(t=>t.TABLE_NAME).join(", "));
if (tabParcela.length > 0) {
    const parcelas = await q(`
        SELECT p.CODPARCELA, p.DESCRICAO, p.PRAZO1, p.PRAZO2, p.PRAZO3
        FROM ${tabParcela[0].TABLE_NAME} p
        WHERE p.PRAZO1 <= 30
        ORDER BY p.PRAZO1
        FETCH FIRST 10 ROWS ONLY
    `).catch(() => []);
    parcelas.forEach(r => console.log(`  CODPARCELA=${r.CODPARCELA} | ${r.DESCRICAO} | Prazo: ${r.PRAZO1}/${r.PRAZO2||'-'}/${r.PRAZO3||'-'}`));
}

// ═══════════════════════════════════════════════════════════════
// BLOCO 5 — HISTÓRICO: CNPJ das 303 NFS-e × PCLANC/PCNFENT
//   Para cada CNPJ que JÁ tem histórico, identificar conta e filial
// ═══════════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("5. HISTÓRICO — CNPJ das NFS-e Tomadas que já lançaram antes");
console.log("   (conta gerencial + filial usadas anteriormente)");
console.log("═══════════════════════════════════════════════════════════════");
// Cruzar: NFs recentes com ISS em PCNFENT → conta e filial usadas
const historico = await q(`
    SELECT f.CGC, f.FORNECEDOR, f.CODFORNEC,
           l.CODCONTA, cc.CONTA AS NOME_CONTA,
           l.CODFILIAL,
           COUNT(*) QTD_LANC,
           MAX(l.DTLANC) ULT_LANC,
           SUM(l.VALOR) TOTAL_PAGO,
           f.PERCISS, f.PERCINSS, f.SIMPLESNACIONAL
    FROM PCLANC l
    JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
    LEFT JOIN PCCONTA cc ON cc.CODCONTA = l.CODCONTA
    WHERE l.NFSERVICO = 'S'
      AND l.RECNUM = l.RECNUMPRINC
      AND l.DTLANC >= TRUNC(SYSDATE) - 730
    GROUP BY f.CGC, f.FORNECEDOR, f.CODFORNEC, l.CODCONTA, cc.CONTA, l.CODFILIAL,
             f.PERCISS, f.PERCINSS, f.SIMPLESNACIONAL
    ORDER BY f.CGC, QTD_LANC DESC
    FETCH FIRST 60 ROWS ONLY
`);
historico.forEach(r => {
    console.log(`\n  CNPJ: ${r.CGC} | ${r.FORNECEDOR} (CF:${r.CODFORNEC})`);
    console.log(`    CONTA: ${r.CODCONTA} — ${r.NOME_CONTA||'?'} | FILIAL: ${r.CODFILIAL}`);
    console.log(`    Lançamentos: ${r.QTD_LANC} | Último: ${r.ULT_LANC?.toISOString?.().slice(0,10)} | Total: R$ ${Number(r.TOTAL_PAGO).toFixed(2)}`);
    console.log(`    ISS: ${r.PERCISS||0}% | INSS: ${r.PERCINSS||0}% | Simples: ${r.SIMPLESNACIONAL||'N'}`);
});

// ═══════════════════════════════════════════════════════════════
// BLOCO 6 — CODFISCAL 199: confirmar que é válido para todos os serviços
// ═══════════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("6. CODFISCAL 199 — o que significa?");
console.log("═══════════════════════════════════════════════════════════════");
const cfopTab = await q(`
    SELECT TABLE_NAME FROM ALL_TABLES
    WHERE OWNER = 'U_CC4UJM_WI' AND TABLE_NAME LIKE '%FISCAL%'
    FETCH FIRST 10 ROWS ONLY
`);
console.log("  Tabelas fiscais:", cfopTab.map(t=>t.TABLE_NAME).join(", "));
const cfop = await q(`
    SELECT * FROM PCCFOP WHERE CODCFOP = 199
`).catch(() => []);
if (cfop.length > 0) cfop.forEach(r => console.log("  ", JSON.stringify(r)));

// buscar o que o código 199 representa nas NFs
const cfopNfs = await q(`
    SELECT n.CODFISCAL, COUNT(*) QTD,
           MAX(n.OBS) EX_OBS,
           MAX(n.ESPECIE) ESPECIE
    FROM PCNFENT n
    WHERE n.VLISS > 0
    GROUP BY n.CODFISCAL
    ORDER BY QTD DESC
`).catch(() => []);
cfopNfs.forEach(r => console.log(`  CODFISCAL=${r.CODFISCAL} | ${r.QTD} notas serviço | ESPECIE=${r.ESPECIE}`));

// ═══════════════════════════════════════════════════════════════
// BLOCO 7 — DADOS NFS-e × O que está no XML ADN
//   Quais campos do NFS-e XML ADN mapeiam para PCFORNEC?
// ═══════════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log("7. PCNFENT.CODCONT — de onde vem? É sempre igual ao PCFORNEC.CODPARCELA?");
console.log("═══════════════════════════════════════════════════════════════");
const codcontCheck = await q(`
    SELECT n.CODFORNEC, f.FORNECEDOR,
           n.CODCONT AS NF_CODCONT,
           f.CODPARCELA AS FORN_CODPARCELA,
           CASE WHEN n.CODCONT = f.CODPARCELA THEN 'IGUAL' ELSE 'DIFERENTE' END MATCH
    FROM PCNFENT n
    JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
    WHERE n.VLISS > 0
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 365
    FETCH FIRST 20 ROWS ONLY
`);
const igual = codcontCheck.filter(r => r.MATCH === 'IGUAL').length;
const dif   = codcontCheck.filter(r => r.MATCH === 'DIFERENTE').length;
console.log(`\n  Dos ${codcontCheck.length} registros analisados: ${igual} IGUAIS, ${dif} DIFERENTES`);
codcontCheck.filter(r=>r.MATCH==='DIFERENTE').slice(0,5).forEach(r =>
    console.log(`  CF:${r.CODFORNEC} ${r.FORNECEDOR}: NF_CODCONT=${r.NF_CODCONT} | FORN_CODPARCELA=${r.FORN_CODPARCELA}`)
);

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");

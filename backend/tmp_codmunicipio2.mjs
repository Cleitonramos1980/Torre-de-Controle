import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "mun2"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// 1. CODCIDADE vs CODMUNICIPIO na PCFORNEC — qual está preenchido?
console.log("=== 1. CODCIDADE e CODMUNICIPIO — quais estão preenchidos? ===");
const uso = await q(`
    SELECT
        COUNT(*) TOTAL,
        SUM(CASE WHEN CODMUNICIPIO IS NOT NULL AND CODMUNICIPIO <> 0 THEN 1 ELSE 0 END) TEM_CODMUNICIPIO,
        SUM(CASE WHEN CODCIDADE    IS NOT NULL AND CODCIDADE    <> 0 THEN 1 ELSE 0 END) TEM_CODCIDADE
    FROM PCFORNEC
    WHERE EXCLUIDO <> 'S'
`);
uso.forEach(r => console.log("  Total ativos: " + r.TOTAL + " | com CODMUNICIPIO: " + r.TEM_CODMUNICIPIO + " | com CODCIDADE: " + r.TEM_CODCIDADE));

// 2. Amostra de fornecedores com CODCIDADE preenchido
console.log("\n=== 2. Fornecedores com CODCIDADE preenchido ===");
const comCodcidade = await q(`
    SELECT f.CODFORNEC, f.FORNECEDOR, f.CIDADE, f.ESTADO, f.CEP,
           f.CODCIDADE, f.CODMUNICIPIO,
           c.NOMECIDADE, c.CODIBGE, c.UF
    FROM PCFORNEC f
    LEFT JOIN PCCIDADE c ON c.CODCIDADE = f.CODCIDADE
    WHERE f.CODCIDADE IS NOT NULL AND f.CODCIDADE <> 0
      AND f.EXCLUIDO <> 'S'
      AND ROWNUM <= 8
    ORDER BY f.DTCADASTRO DESC
`);
comCodcidade.forEach(r =>
    console.log("  CF:" + r.CODFORNEC + " | " + r.FORNECEDOR + " | CIDADE=" + r.CIDADE + "-" + r.ESTADO +
                " | CODCIDADE=" + r.CODCIDADE + " → NOMECIDADE=" + r.NOMECIDADE + " | CODIBGE=" + r.CODIBGE)
);

// 3. PCCIDADEFORNEC — o que é?
console.log("\n=== 3. Estrutura PCCIDADEFORNEC ===");
const colsCidForn = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCCIDADEFORNEC' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsCidForn.forEach(r => console.log("  " + String(r.COLUMN_NAME).padEnd(20) + r.DATA_TYPE + "(" + r.DATA_LENGTH + ")"));
const amostCidForn = await q(`SELECT * FROM PCCIDADEFORNEC WHERE ROWNUM <= 3`);
amostCidForn.forEach(r => console.log("  " + JSON.stringify(r)));

// 4. Busca Manaus e Belém na PCCIDADE para entender os CODCIDADEs das nossas praças
console.log("\n=== 4. Cidades principais na PCCIDADE ===");
const cidades = await q(`
    SELECT CODCIDADE, NOMECIDADE, CODIBGE, UF
    FROM PCCIDADE
    WHERE NOMECIDADE IN ('MANAUS','BELEM','BELEM','SANTAREM','RIO BRANCO','ANANINDEUA','CASTANHAL','MARABA')
       OR (UF = 'AM' AND NOMECIDADE = 'MANAUS')
       OR (UF = 'PA' AND NOMECIDADE IN ('BELEM','SANTAREM'))
    ORDER BY UF, NOMECIDADE
`);
cidades.forEach(r => console.log("  CODCIDADE=" + r.CODCIDADE + " | " + r.NOMECIDADE + "-" + r.UF + " | CODIBGE=" + r.CODIBGE));

// 5. No XML da NFS-e, o campo de município vem como CODIBGE (7 dígitos)
//    Como fazer a conversão CODIBGE → CODCIDADE (WinThor)?
console.log("\n=== 5. Conversão CODIBGE → CODCIDADE (campos para o cadastro) ===");
const conv = await q(`
    SELECT CODCIDADE, NOMECIDADE, CODIBGE, UF
    FROM PCCIDADE
    WHERE CODIBGE IN (1302603, 1500602, 1506807, 1200401, 1500800, 1502103, 1504208)
    ORDER BY UF, NOMECIDADE
`);
conv.forEach(r => console.log("  CODIBGE=" + r.CODIBGE + " → CODCIDADE=" + r.CODCIDADE + " | " + r.NOMECIDADE + "-" + r.UF));

// 6. Qual campo a PCFORNEC realmente usa — CODCIDADE ou CODMUNICIPIO?
//    Verificar no contexto do lançamento de ISS — a Prefeitura usa qual campo?
console.log("\n=== 6. Prefeituras cadastradas — qual campo têm? ===");
const prefs = await q(`
    SELECT f.CODFORNEC, f.FORNECEDOR, f.CIDADE, f.ESTADO,
           f.CODCIDADE, f.CODMUNICIPIO,
           c.CODIBGE
    FROM PCFORNEC f
    LEFT JOIN PCCIDADE c ON c.CODCIDADE = f.CODCIDADE
    WHERE (f.FORNECEDOR LIKE '%PREFEITURA%' OR f.FORNECEDOR LIKE '%MUNICIPIO%')
      AND f.EXCLUIDO <> 'S'
    ORDER BY f.CODFORNEC
`);
prefs.forEach(r =>
    console.log("  CF:" + r.CODFORNEC + " | " + r.FORNECEDOR + " | CIDADE=" + r.CIDADE + "-" + r.ESTADO +
                " | CODCIDADE=" + r.CODCIDADE + " | CODMUNICIPIO=" + r.CODMUNICIPIO + " | CODIBGE=" + r.CODIBGE)
);

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");

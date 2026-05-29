const oracledb = require("C:/TorreControle/backend/node_modules/oracledb");
const CS = "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))";
async function main() {
    oracledb.fetchAsString = [oracledb.CLOB];
    await oracledb.createPool({ user:"U_CC4UJM_WI", password:"AFT5L44D2Z56IZ3E65", connectString:CS, poolMin:1, poolMax:3, poolIncrement:1 });
    const conn = await oracledb.getConnection();
    const q = async (label, sql, binds) => {
        console.log("\n" + "=".repeat(70) + "\n" + label + "\n" + "=".repeat(70));
        try {
            const r = await conn.execute(sql, binds||{}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            if(r.metaData) console.log("Cols:", r.metaData.map(c=>c.name).join(", "));
            (r.rows||[]).forEach((row,i) => console.log("["+i+"]", JSON.stringify(row)));
            console.log("Total:", (r.rows||[]).length);
        } catch(e) { console.error("ERRO:", e.message); }
    };

    // 1. PCPRODUT — todas as colunas com tipo e nullable
    await q("PCPRODUT — TODAS as colunas (ordem, tipo, nullable)",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, DATA_DEFAULT
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCPRODUT'
         ORDER BY COLUMN_ID`);

    // 2. PCPRODUT — constraints (chaves, NOT NULL obrigatórias)
    await q("PCPRODUT — constraints",
        `SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, cc.COLUMN_NAME, c.SEARCH_CONDITION
         FROM USER_CONSTRAINTS c
         JOIN USER_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
         WHERE c.TABLE_NAME = 'PCPRODUT'
         ORDER BY c.CONSTRAINT_TYPE, cc.POSITION`);

    // 3. Produto real completo (exemplo de colchão bem cadastrado)
    await q("PCPRODUT — exemplo produto colchão cadastrado completo",
        `SELECT * FROM PCPRODUT WHERE CODPROD = 170002`);

    // 4. Outro produto mais antigo e bem preenchido
    await q("PCPRODUT — produto mais antigo com mais campos preenchidos",
        `SELECT p.* FROM PCPRODUT p
         WHERE p.NBM IS NOT NULL AND p.CODEPTO IS NOT NULL AND p.CODSEC IS NOT NULL
         AND p.CODFORNEC IS NOT NULL AND ROWNUM = 1
         ORDER BY p.CODPROD`);

    // 5. PCDEP — departamentos
    await q("PCDEP — estrutura e exemplos",
        `SELECT CODEPTO, DESCRICAO FROM PCDEP ORDER BY CODEPTO FETCH FIRST 10 ROWS ONLY`);

    // 6. PCSEC — seções
    await q("PCSEC — estrutura e exemplos",
        `SELECT CODSEC, CODEPTO, DESCRICAO FROM PCSEC ORDER BY CODEPTO, CODSEC FETCH FIRST 10 ROWS ONLY`);

    // 7. PCEMBALAGEM — embalagem (existe?)
    await q("Tabelas de embalagem/unidade existentes",
        `SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME IN ('PCEMBALAGEM','PCUNIDADE','PCEMB') ORDER BY 1`);

    // 8. PCPRODFILIAL — exemplo real de produto cadastrado em filial
    await q("PCPRODFILIAL — exemplo real de produto (CODPROD=170002)",
        `SELECT CODPROD, CODFILIAL, ATIVO, PROIBIDAVENDA, REVENDA,
                CODFIGURA, CODSITTRIBPISCOFINS, CODEXCECAOPISCOFINS,
                PISCOFINSRETIDO, PERPIS, PERCOFINS, CALCCREDIPI,
                MULTIPLO, MULTIPLOCOMPRAS, ESTOQUEMIN, ESTOQUEMAX,
                CLASSEVENDA, CLASSE, CLASSEESTOQUE,
                GERAICMSLIVROFISCAL, GERAICMSLIVROFISCALENT
         FROM PCPRODFILIAL WHERE CODPROD = 170002 ORDER BY CODFILIAL`);

    // 9. PCPRODFILIAL — constraints
    await q("PCPRODFILIAL — constraints (PK, NOT NULL)",
        `SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, cc.COLUMN_NAME
         FROM USER_CONSTRAINTS c
         JOIN USER_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
         WHERE c.TABLE_NAME = 'PCPRODFILIAL'
         ORDER BY c.CONSTRAINT_TYPE, cc.POSITION`);

    // 10. Outras tabelas relacionadas ao produto
    await q("Tabelas relacionadas a produto (foreign keys saindo de PCPRODUT)",
        `SELECT a.TABLE_NAME, a.CONSTRAINT_NAME, a.R_CONSTRAINT_NAME,
                b.TABLE_NAME AS R_TABLE_NAME
         FROM USER_CONSTRAINTS a
         JOIN USER_CONSTRAINTS b ON b.CONSTRAINT_NAME = a.R_CONSTRAINT_NAME
         WHERE a.TABLE_NAME = 'PCPRODUT' AND a.CONSTRAINT_TYPE = 'R'`);

    // 11. PCPRODUTO related — PCEAN existe?
    await q("Tabelas auxiliares de produto",
        `SELECT TABLE_NAME FROM USER_TABLES
         WHERE TABLE_NAME IN ('PCEAN','PCCODBARRAS','PCPRODEAN','PCLINHAPROD','PCMARCA',
                              'PCGRUPOPROD','PCSUBGRUPOPROD','PCORIGEM','PCNATUREZA')
         ORDER BY 1`);

    // 12. Campos NOT NULL de PCPRODUT (obrigatórios no INSERT)
    await q("PCPRODUT — colunas NOT NULL (obrigatórias no INSERT)",
        `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_DEFAULT
         FROM USER_TAB_COLUMNS
         WHERE TABLE_NAME = 'PCPRODUT' AND NULLABLE = 'N'
         ORDER BY COLUMN_ID`);

    // 13. Campos NOT NULL de PCPRODFILIAL
    await q("PCPRODFILIAL — colunas NOT NULL",
        `SELECT COLUMN_NAME, DATA_TYPE, DATA_DEFAULT
         FROM USER_TAB_COLUMNS
         WHERE TABLE_NAME = 'PCPRODFILIAL' AND NULLABLE = 'N'
         ORDER BY COLUMN_ID`);

    // 14. PCFORNEC — campos relevantes para produto
    await q("PCFORNEC — tipo de fornecedor do produto 170002",
        `SELECT f.CODFORNEC, f.FORNECEDOR, f.TIPOFORNEC, f.CGC, f.SIMPLESNACIONAL
         FROM PCFORNEC f
         JOIN PCPRODUT p ON p.CODFORNEC = f.CODFORNEC
         WHERE p.CODPROD = 170002`);

    // 15. Sequência lógica: o que já existe para codprod 170002
    await q("PCPRODUT — produto 170002 campos essenciais",
        `SELECT CODPROD, DESCRICAO, EMBALAGEM, UNIDADE,
                CODEPTO, CODSEC, CODFORNEC,
                NBM, CLASSIFICFISCAL, SITTRIBUT,
                PERPIS, PERCOFINS, PISCOFINSRETIDO,
                CODTRIBPISCOFINS, CODSITTRIBPISCOFINS,
                PESOBRUTO, PESOLIQUID, QTUNITCX, QTUNIT,
                ATIVO, TIPOMERC, CODFAB
         FROM PCPRODUT WHERE CODPROD = 170002`);

    await conn.close();
    process.exit(0);
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });

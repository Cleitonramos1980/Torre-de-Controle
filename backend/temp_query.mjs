import { initOraclePool, executeOracle } from "./dist/db/oracle.js";
import oracledb from "oracledb";

async function runQuery(label, sql) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`=== ${label} ===`);
    console.log("=".repeat(60));
    try {
        const r = await executeOracle(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (!r.rows || r.rows.length === 0) {
            console.log("(sem resultados)");
        } else {
            console.log(`Rows: ${r.rows.length}`);
            console.log(JSON.stringify(r.rows, null, 2));
        }
    } catch (e) {
        console.log(`ERRO: ${e.message}`);
    }
}

async function main() {
    await initOraclePool();

    // Query 1: Tabelas de departamento e seção
    await runQuery("1: Tabelas de departamento e secao existentes", `
        SELECT TABLE_NAME FROM USER_TABLES
        WHERE TABLE_NAME IN ('PCDEPTO', 'PCSECAO', 'PCSETOR', 'PCDEPARTAMENTO', 'PCDEPART', 'PCGRUPOPRODUTO')
        ORDER BY TABLE_NAME
    `);

    // Query 2: Estrutura de PCDEPTO
    await runQuery("2: Estrutura de PCDEPTO", `
        SELECT COLUMN_NAME, DATA_TYPE, NULLABLE FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCDEPTO' ORDER BY COLUMN_ID
    `);

    // Query 3: Estrutura de PCSECAO
    await runQuery("3: Estrutura de PCSECAO", `
        SELECT COLUMN_NAME, DATA_TYPE, NULLABLE FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCSECAO' ORDER BY COLUMN_ID
    `);

    // Query 4: Dados reais de PCDEPTO (todos os departamentos)
    await runQuery("4: Dados reais de PCDEPTO (todos os departamentos)", `
        SELECT * FROM PCDEPTO ORDER BY CODEPTO
    `);

    // Query 5: Dados reais de PCSECAO (primeiras 50 seções)
    await runQuery("5: Dados reais de PCSECAO (limite 50)", `
        SELECT CODSEC, CODEPTO, DESCRICAO FROM PCSECAO ORDER BY CODEPTO, CODSEC FETCH FIRST 50 ROWS ONLY
    `);

    // Query 6: Verificar tabela PCFORNEC campos para busca por CGC
    await runQuery("6: PCFORNEC - campos CODFORNEC, FORNECEDOR, CGC (3 primeiros)", `
        SELECT CODFORNEC, FORNECEDOR, CGC FROM PCFORNEC WHERE ROWNUM <= 3
    `);

    // Query 7: Campos da PCPRODUT importantes
    await runQuery("7: Campos importantes de PCPRODUT (NBM, fiscal, depto, etc)", `
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
        FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCPRODUT'
        AND COLUMN_NAME IN ('NBM', 'CLASSIFICFISCAL', 'CODEAN', 'CODAUXILIAR', 'SITTRIBUT', 'CST', 'CSTPIS', 'CSTCOFINS', 'CFOP', 'TIPOICM', 'TIPOEMB', 'REVENDA', 'ATIVO', 'DTCADASTRO', 'CODDEPTO', 'CODFAMILIA')
        ORDER BY COLUMN_ID
    `);

    process.exit(0);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });

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

    // Query D corrigida — sem TOTPED (não existe em PCPEDI), sem colunas inválidas
    await runQuery("D (corrigida): Pedido 8731 com itens PCPEDI", `
        SELECT p.NUMPED, p.CODFORNEC, p.DTPEDIDO, p.CODFILIAL, p.POSICAO,
               i.CODPROD, i.QT, i.PVENDA, i.PTABELA, i.ST, i.NUMSEQ, i.POSICAO AS POSICAO_ITEM
        FROM PCPEDIDO p
        LEFT JOIN PCPEDI i ON i.NUMPED = p.NUMPED
        WHERE p.NUMPED = 8731
        FETCH FIRST 20 ROWS ONLY
    `);

    // Query F corrigida — sem R_TABLE_NAME (coluna de USER_CONSTRAINTS é diferente)
    await runQuery("F (corrigida): Constraints de PCPEDIDO", `
        SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE, SEARCH_CONDITION,
               R_OWNER, R_CONSTRAINT_NAME, STATUS, VALIDATED
        FROM USER_CONSTRAINTS
        WHERE TABLE_NAME = 'PCPEDIDO'
    `);

    // Estrutura de PCPEDCOMPRAOPERLOGCAB e PCPEDCOMPRAOPERLOGITE
    await runQuery("G: Estrutura PCPEDCOMPRAOPERLOGCAB (cabeçalho)", `
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
        FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCPEDCOMPRAOPERLOGCAB'
        ORDER BY COLUMN_ID
    `);

    await runQuery("H: Estrutura PCPEDCOMPRAOPERLOGITE (itens)", `
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
        FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCPEDCOMPRAOPERLOGITE'
        ORDER BY COLUMN_ID
    `);

    // Verificar se PCPEDIDO tem campo TIPOPED / CODOPER para identificar pedidos de compra
    await runQuery("I: Campos chave de PCPEDIDO para compras", `
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, DATA_DEFAULT
        FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCPEDIDO'
          AND COLUMN_NAME IN (
            'NUMPED','CODFORNEC','CODFILIAL','DTPEDIDO','POSICAO','TIPOPED','CODOPER',
            'CODCOB','CONDVENDA','OBS','CODPLPAG','CODFUNCLANC','DTLANC',
            'NUMTRANSACAO','VLPEDIDO','NUMBONUS','DTENTREGA','CODCOMPRADOR',
            'TIPOFRETE','VLOUTROS','VLFRETE'
          )
        ORDER BY COLUMN_ID
    `);

    // Verificar um pedido real de PCPEDIDO para ver quais campos têm valor
    await runQuery("J: Amostra real do pedido 8731 em PCPEDIDO", `
        SELECT * FROM PCPEDIDO WHERE NUMPED = 8731
    `);

    // Verificar tabela PCPEDAGENDACOMPRA ou similar de compras
    await runQuery("K: Tabelas de agenda/cotação de compra", `
        SELECT TABLE_NAME FROM USER_TABLES
        WHERE TABLE_NAME LIKE 'PCPEDAGENDA%'
           OR TABLE_NAME LIKE 'PCAGENDAPED%'
           OR TABLE_NAME LIKE '%COTACAO%'
           OR TABLE_NAME LIKE '%COMPRAI%'
        ORDER BY TABLE_NAME
    `);

    // Estrutura de PCAGENDAPEDCOMPRAI (apareceu na query A com NUMPED NOT NULL)
    await runQuery("L: Estrutura PCAGENDAPEDCOMPRAI", `
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, DATA_DEFAULT
        FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCAGENDAPEDCOMPRAI'
        ORDER BY COLUMN_ID
    `);

    process.exit(0);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });

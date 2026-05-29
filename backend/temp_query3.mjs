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

    // Estrutura completa de PCPEDIDO
    await runQuery("M: Estrutura completa de PCPEDIDO (todos os campos)", `
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, DATA_DEFAULT
        FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCPEDIDO'
        ORDER BY COLUMN_ID
    `);

    // D corrigida sem POSICAO no PCPEDIDO (esse campo não existe lá)
    await runQuery("D (final): Pedido 8731 com itens PCPEDI", `
        SELECT p.NUMPED, p.CODFORNEC, p.DTEMISSAO, p.CODFILIAL,
               p.VLTOTAL, p.NUMTRANSVENDA,
               i.CODPROD, i.QT, i.PVENDA, i.PTABELA, i.ST, i.NUMSEQ,
               i.VLCUSTOFIN, i.PERDESC, i.POSICAO AS POSICAO_ITEM
        FROM PCPEDIDO p
        LEFT JOIN PCPEDI i ON i.NUMPED = p.NUMPED
        WHERE p.NUMPED = 8731
        FETCH FIRST 10 ROWS ONLY
    `);

    // Ver amostra de pedidos recentes para entender quais campos são usados
    await runQuery("N: 5 pedidos mais recentes em PCPEDIDO", `
        SELECT NUMPED, CODFORNEC, DTEMISSAO, CODFILIAL, VLTOTAL,
               NUMTRANSVENDA, CODCOMPRADOR, DTPREVENT
        FROM PCPEDIDO
        ORDER BY NUMPED DESC
        FETCH FIRST 5 ROWS ONLY
    `);

    // Verificar primary key de PCPEDI
    await runQuery("O: Constraints de PCPEDI", `
        SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE, SEARCH_CONDITION,
               R_OWNER, R_CONSTRAINT_NAME, STATUS
        FROM USER_CONSTRAINTS
        WHERE TABLE_NAME = 'PCPEDI'
        AND CONSTRAINT_TYPE IN ('P','U','C')
        ORDER BY CONSTRAINT_TYPE
    `);

    // Ver colunas da PK de PCPEDI
    await runQuery("P: Colunas da PK de PCPEDIDO e PCPEDI", `
        SELECT uc.TABLE_NAME, uc.CONSTRAINT_NAME, ucc.COLUMN_NAME, ucc.POSITION
        FROM USER_CONSTRAINTS uc
        JOIN USER_CONS_COLUMNS ucc ON ucc.CONSTRAINT_NAME = uc.CONSTRAINT_NAME
        WHERE uc.TABLE_NAME IN ('PCPEDIDO', 'PCPEDI')
          AND uc.CONSTRAINT_TYPE = 'P'
        ORDER BY uc.TABLE_NAME, ucc.POSITION
    `);

    // Verificar próximo número de NUMPED disponível
    await runQuery("Q: Max NUMPED em PCPEDIDO", `
        SELECT MAX(NUMPED) AS MAX_NUMPED, COUNT(*) AS TOTAL FROM PCPEDIDO
    `);

    // Verificar sequência Oracle para NUMPED
    await runQuery("R: Sequências Oracle disponíveis para PCPEDIDO", `
        SELECT SEQUENCE_NAME, LAST_NUMBER, INCREMENT_BY, MIN_VALUE, MAX_VALUE
        FROM USER_SEQUENCES
        WHERE SEQUENCE_NAME LIKE '%PED%' OR SEQUENCE_NAME LIKE '%NUMPED%'
        ORDER BY SEQUENCE_NAME
    `);

    process.exit(0);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });

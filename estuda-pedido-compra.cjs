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

    // 1. Tabelas de pedido de compra
    await q("Tabelas de pedido de compra existentes",
        `SELECT TABLE_NAME FROM USER_TABLES
         WHERE TABLE_NAME IN ('PCPEDIDO','PCPEDIDOI','PCCOTACAO','PCCOTACAOI',
                              'PCPEDCOMP','PCPEDCOMPI','PCPEDIDO1','PCPEDIDO2',
                              'PCPC','PCPCI','PCPED','PCPEDI')
         ORDER BY 1`);

    // 2. Tabelas de entrada/recebimento
    await q("Tabelas de entrada/recebimento existentes",
        `SELECT TABLE_NAME FROM USER_TABLES
         WHERE TABLE_NAME IN ('PCMOV','PCMOVI','PCENTRADA','PCENTRADAI',
                              'PCNFENT','PCNFENTI','PCNFENTITEM','PCRECEBIMENTO',
                              'PCDOCELETRONICO','PCRETAGUARDA','PCRETAGUARDAI')
         ORDER BY 1`);

    // 3. Estrutura PCNFENT (cabeçalho da NF-e de entrada)
    await q("PCNFENT — colunas NOT NULL",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCNFENT' AND NULLABLE='N'
         ORDER BY COLUMN_ID`);

    // 4. PCNFENT — todas as colunas
    await q("PCNFENT — todas as colunas (ordem e tipo)",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCNFENT'
         ORDER BY COLUMN_ID`);

    // 5. PCNFENT — exemplo real (nota recente)
    await q("PCNFENT — exemplo real de NF-e entrada recente",
        `SELECT NUMTRANSENT, NUMNOTA, SERIE, DTEMISSAO, DTENTRADA,
                CGC, FORNECEDOR, CODFORNEC, CODFILIAL,
                VLTOTAL, VLICMS, VLPIS, VLCOFINS, VLIPI,
                CHAVENFE, NUMPED, CODUSUR, OBSERVACAO
         FROM PCNFENT WHERE ROWNUM <= 3 ORDER BY NUMTRANSENT DESC`);

    // 6. PCMOV — estrutura (itens de movimentação)
    await q("PCMOV — colunas NOT NULL",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCMOV' AND NULLABLE='N'
         ORDER BY COLUMN_ID`);

    // 7. PCMOV — exemplo de entrada vinculada a PCNFENT
    await q("PCMOV — exemplo item de entrada (CODOPER=E ou tipo entrada)",
        `SELECT m.NUMTRANSENT, m.CODPROD, m.CODFILIAL, m.QT, m.PVENDA, m.PUNIT,
                m.PTABELA, m.DTMOV, m.CODOPER, m.CODFORNEC, m.NUMPED
         FROM PCMOV m WHERE m.NUMTRANSENT IS NOT NULL AND ROWNUM <= 5
         ORDER BY m.NUMTRANSENT DESC`);

    // 8. PCPEDIDO — estrutura completa
    await q("PCPEDIDO — todas as colunas",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCPEDIDO'
         ORDER BY COLUMN_ID`);

    // 9. PCPEDIDO — NOT NULL
    await q("PCPEDIDO — colunas NOT NULL",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_DEFAULT
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCPEDIDO' AND NULLABLE='N'
         ORDER BY COLUMN_ID`);

    // 10. PCPEDIDO — exemplo real
    await q("PCPEDIDO — exemplo recente",
        `SELECT NUMPED, CODFORNEC, CODFILIAL, CONDPAG, DTPEDIDO, DTPREVENT,
                VLTOTAL, VLFRETE, STATUS, TIPOPED, OBSPED, CODUSUARIOPEDIDO
         FROM PCPEDIDO WHERE ROWNUM <= 3 ORDER BY NUMPED DESC`);

    // 11. PCPEDIDOI — itens do pedido
    await q("PCPEDIDOI — colunas NOT NULL",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_DEFAULT
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCPEDIDOI' AND NULLABLE='N'
         ORDER BY COLUMN_ID`);

    // 12. PCPEDIDOI — todas as colunas
    await q("PCPEDIDOI — todas as colunas",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCPEDIDOI'
         ORDER BY COLUMN_ID`);

    // 13. PCPEDIDOI — exemplo real
    await q("PCPEDIDOI — exemplo real (itens do pedido)",
        `SELECT pi.NUMPED, pi.CODPROD, pi.QT, pi.QTRECEB, pi.PUNIT, pi.PTABELA,
                pi.VLUNIT, pi.CODFILIAL, pi.NUMTRANSENT
         FROM PCPEDIDOI pi WHERE ROWNUM <= 5 ORDER BY pi.NUMPED DESC`);

    // 14. Link PCNFENT → PCPEDIDO
    await q("PCNFENT — campo NUMPED (link com pedido)",
        `SELECT NUMTRANSENT, NUMNOTA, NUMPED, CODFORNEC, VLTOTAL
         FROM PCNFENT WHERE NUMPED IS NOT NULL AND ROWNUM <= 5 ORDER BY NUMTRANSENT DESC`);

    // 15. PCPEDIDO — constraints PK
    await q("PCPEDIDO — constraints PK/FK",
        `SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, cc.COLUMN_NAME
         FROM USER_CONSTRAINTS c
         JOIN USER_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
         WHERE c.TABLE_NAME = 'PCPEDIDO'
         ORDER BY c.CONSTRAINT_TYPE, cc.POSITION`);

    // 16. PCPEDIDOI — constraints
    await q("PCPEDIDOI — constraints PK/FK",
        `SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, cc.COLUMN_NAME
         FROM USER_CONSTRAINTS c
         JOIN USER_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
         WHERE c.TABLE_NAME = 'PCPEDIDOI'
         ORDER BY c.CONSTRAINT_TYPE, cc.POSITION`);

    // 17. PCNFENT — constraints
    await q("PCNFENT — constraints PK/FK",
        `SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, cc.COLUMN_NAME
         FROM USER_CONSTRAINTS c
         JOIN USER_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
         WHERE c.TABLE_NAME = 'PCNFENT'
         ORDER BY c.CONSTRAINT_TYPE, cc.POSITION`);

    // 18. Sequence de NUMPED
    await q("Sequences relacionadas a pedido/transação",
        `SELECT SEQUENCE_NAME, LAST_NUMBER, INCREMENT_BY, MIN_VALUE, MAX_VALUE
         FROM USER_SEQUENCES
         WHERE SEQUENCE_NAME IN ('PCPEDIDO_SEQ','PCNFENT_SEQ','SEQ_NUMPED',
                                  'SEQ_NUMTRANSENT','SEQ_PEDIDO','PCPEDIDO_NUMPED_SEQ')
         ORDER BY 1`);

    // 19. Todas as sequences disponíveis
    await q("Todas as sequences do schema",
        `SELECT SEQUENCE_NAME, LAST_NUMBER FROM USER_SEQUENCES ORDER BY 1`);

    // 20. PCDOCELETRONICO — estrutura
    await q("PCDOCELETRONICO — colunas principais",
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
         FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCDOCELETRONICO'
         ORDER BY COLUMN_ID`);

    // 21. PCCONDPAG — condições de pagamento
    await q("PCCONDPAG — exemplos",
        `SELECT CODCONDPAG, DESCRICAO FROM PCCONDPAG WHERE ROWNUM <= 10 ORDER BY CODCONDPAG`);

    // 22. PCFILIAL para referência
    await q("PCFILIAL — estrutura básica",
        `SELECT CODIGO, RAZAOSOCIAL, UF, FANTASIA FROM PCFILIAL WHERE ROWNUM <= 5 ORDER BY CODIGO`);

    await conn.close();
    process.exit(0);
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });

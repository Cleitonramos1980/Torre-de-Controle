import { executeOracle, isOracleEnabled } from "../db/oracle.js";

export async function auditarChaveNfe(chave) {
    if (!isOracleEnabled() || !chave || chave.length !== 44) {
        return { encontrado: false, entradas: [] };
    }
    try {
        const res = await executeOracle(
            `SELECT n.NUMTRANSENT, n.DTENT, n.CODFORNEC, n.NUMNOTA, n.SERIE,
                    n.CODFILIAL, n.VLNOTA, n.CHAVENFE
             FROM PCNFENT n
             WHERE n.CHAVENFE = :chave
             ORDER BY n.NUMTRANSENT DESC
             FETCH FIRST 10 ROWS ONLY`,
            { chave },
            { outFormat: 4002 }
        );
        const rows = res?.rows ?? [];
        return {
            encontrado: rows.length > 0,
            entradas: rows.map(r => ({
                numTransent:  r.NUMTRANSENT,
                dtEnt:        r.DTENT ? new Date(r.DTENT).toISOString() : null,
                codFornec:    r.CODFORNEC,
                numNota:      r.NUMNOTA,
                serie:        r.SERIE,
                codFilial:    r.CODFILIAL,
                vlNota:       r.VLNOTA,
            })),
        };
    } catch {
        return { encontrado: false, entradas: [] };
    }
}

export async function buscarFornecedorWinthor(cnpj) {
    if (!isOracleEnabled() || !cnpj) return null;
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    try {
        const res = await executeOracle(
            `SELECT f.CODFORNEC, f.FORNECEDOR, f.CGC, f.ATIVO
             FROM PCFORNEC f
             WHERE REGEXP_REPLACE(f.CGC, '[^0-9]', '') = :cnpj
               AND ROWNUM = 1`,
            { cnpj: cnpjLimpo },
            { outFormat: 4002 }
        );
        const row = res?.rows?.[0];
        if (!row) return null;
        return { codFornec: row.CODFORNEC, nome: row.FORNECEDOR, cgc: row.CGC, ativo: row.ATIVO };
    } catch {
        return null;
    }
}

export async function consultarPedidoCompra(cnpjFornec, numNota, codFilial) {
    if (!isOracleEnabled()) return [];
    const cnpjLimpo = (cnpjFornec || "").replace(/\D/g, "");
    try {
        const res = await executeOracle(
            `SELECT p.NUMPED, p.DTPEDIDO, p.CODFORNEC, p.POSICAO, p.VLPEDIDO, p.CODFILIAL
             FROM PCPEDCPG p
             INNER JOIN PCFORNEC f ON f.CODFORNEC = p.CODFORNEC
             WHERE REGEXP_REPLACE(f.CGC, '[^0-9]', '') = :cnpj
               AND (:nota IS NULL OR p.NUMPED = :nota)
               AND (:filial IS NULL OR p.CODFILIAL = :filial)
               AND p.POSICAO NOT IN ('C')
             ORDER BY p.DTPEDIDO DESC
             FETCH FIRST 5 ROWS ONLY`,
            { cnpj: cnpjLimpo, nota: numNota || null, filial: codFilial || null },
            { outFormat: 4002 }
        );
        return (res?.rows ?? []).map(r => ({
            numPed:    r.NUMPED,
            dtPedido:  r.DTPEDIDO ? new Date(r.DTPEDIDO).toISOString() : null,
            codFornec: r.CODFORNEC,
            posicao:   r.POSICAO,
            vlPedido:  r.VLPEDIDO,
            codFilial: r.CODFILIAL,
        }));
    } catch {
        return [];
    }
}

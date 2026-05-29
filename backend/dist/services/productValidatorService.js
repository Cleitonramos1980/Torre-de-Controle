import { executeOracle, isOracleEnabled } from "../db/oracle.js";

export async function buscarProdutoWinthor({ ean, codProdFornecedor, cnpjFornecedor }) {
    if (!isOracleEnabled()) return { encontrado: false, produtos: [], mapeamento: null };

    // 1. Verificar mapeamento existente (DFE_PRODUTO_FORNECEDOR_MAPA)
    if (cnpjFornecedor && codProdFornecedor) {
        try {
            const resMapa = await executeOracle(
                `SELECT m.CODPROD_WINTHOR, m.DESCRICAO_FORN, m.UNIDADE_FORN, m.FATOR_CONVERSAO, m.STATUS
                 FROM DFE_PRODUTO_FORNECEDOR_MAPA m
                 WHERE m.CNPJ_FORNECEDOR = :cnpj
                   AND m.COD_PROD_FORNECEDOR = :cod
                   AND m.STATUS = 'ATIVO'
                   AND ROWNUM = 1`,
                { cnpj: cnpjFornecedor.replace(/\D/g, "").padStart(14, "0"), cod: codProdFornecedor },
                { outFormat: 4002 }
            );
            const mRow = resMapa?.rows?.[0];
            if (mRow) {
                const prodRes = await executeOracle(
                    `SELECT p.CODPROD, p.DESCRICAO, p.CODAUXILIAR, p.EMBALAGEM, p.UNIDADE, p.NCM, p.ATIVO
                     FROM PCPRODUT p
                     WHERE p.CODPROD = :cod AND ROWNUM = 1`,
                    { cod: mRow.CODPROD_WINTHOR },
                    { outFormat: 4002 }
                );
                const pRow = prodRes?.rows?.[0];
                return {
                    encontrado: true,
                    mapeamento: {
                        codprodWinthor: mRow.CODPROD_WINTHOR,
                        descricaoForn:  mRow.DESCRICAO_FORN,
                        unidadeForn:    mRow.UNIDADE_FORN,
                        fatorConversao: mRow.FATOR_CONVERSAO,
                        status:         mRow.STATUS,
                    },
                    produtos: pRow ? [{
                        codprod:   pRow.CODPROD,
                        descricao: pRow.DESCRICAO,
                        ean:       pRow.CODAUXILIAR,
                        embalagem: pRow.EMBALAGEM,
                        unidade:   pRow.UNIDADE,
                        ncm:       pRow.NCM,
                        ativo:     pRow.ATIVO,
                    }] : [],
                };
            }
        } catch { /* mapeamento não encontrado */ }
    }

    // 2. Busca por EAN direto no PCPRODUT
    const resultados = [];
    if (ean && ean.length >= 8 && ean !== "SEM GTIN" && ean !== "SEMGTIN") {
        try {
            const resEan = await executeOracle(
                `SELECT p.CODPROD, p.DESCRICAO, p.CODAUXILIAR, p.EMBALAGEM, p.UNIDADE, p.NCM, p.ATIVO
                 FROM PCPRODUT p
                 WHERE p.CODAUXILIAR = :ean AND p.ATIVO = 'S'
                 FETCH FIRST 5 ROWS ONLY`,
                { ean },
                { outFormat: 4002 }
            );
            for (const r of (resEan?.rows ?? [])) {
                resultados.push({ codprod: r.CODPROD, descricao: r.DESCRICAO, ean: r.CODAUXILIAR, embalagem: r.EMBALAGEM, unidade: r.UNIDADE, ncm: r.NCM, ativo: r.ATIVO, origemMatch: "EAN" });
            }
        } catch { /* */ }
    }

    // 3. Busca por código do fornecedor no PCPRODUT (CODEPTO pode conter ref. externa)
    if (codProdFornecedor && resultados.length === 0) {
        try {
            const resDesc = await executeOracle(
                `SELECT p.CODPROD, p.DESCRICAO, p.CODAUXILIAR, p.EMBALAGEM, p.UNIDADE, p.NCM, p.ATIVO
                 FROM PCPRODUT p
                 WHERE p.CODAUXILIAR = :cod AND p.ATIVO = 'S'
                 FETCH FIRST 5 ROWS ONLY`,
                { cod: codProdFornecedor },
                { outFormat: 4002 }
            );
            for (const r of (resDesc?.rows ?? [])) {
                resultados.push({ codprod: r.CODPROD, descricao: r.DESCRICAO, ean: r.CODAUXILIAR, embalagem: r.EMBALAGEM, unidade: r.UNIDADE, ncm: r.NCM, ativo: r.ATIVO, origemMatch: "COD_AUX" });
            }
        } catch { /* */ }
    }

    return { encontrado: resultados.length > 0, mapeamento: null, produtos: resultados };
}

export async function salvarMapeamentoProduto({ cnpjFornecedor, codProdFornecedor, ean, codprodWinthor, descricaoForn, unidadeForn, fatorConversao, usuario }) {
    if (!isOracleEnabled()) throw new Error("Oracle não disponível");
    const cnpj = (cnpjFornecedor || "").replace(/\D/g, "").padStart(14, "0");
    // Upsert: DELETE + INSERT para simplificar (sem MERGE para compatibilidade)
    await executeOracle(
        `DELETE FROM DFE_PRODUTO_FORNECEDOR_MAPA WHERE CNPJ_FORNECEDOR = :cnpj AND COD_PROD_FORNECEDOR = :cod`,
        { cnpj, cod: codProdFornecedor }
    );
    await executeOracle(
        `INSERT INTO DFE_PRODUTO_FORNECEDOR_MAPA
            (CNPJ_FORNECEDOR, COD_PROD_FORNECEDOR, EAN, CODPROD_WINTHOR,
             DESCRICAO_FORN, UNIDADE_FORN, FATOR_CONVERSAO, STATUS,
             DATA_CRIACAO, USUARIO_CRIACAO)
         VALUES (:cnpj, :cod, :ean, :winthor,
                 :desc, :unid, :fator, 'ATIVO',
                 SYSDATE, :usuario)`,
        { cnpj, cod: codProdFornecedor, ean: ean || null, winthor: codprodWinthor, desc: descricaoForn || null, unid: unidadeForn || null, fator: fatorConversao || 1, usuario: usuario || "SISTEMA" }
    );
}

export async function buscarProdutosPorDescricao(texto) {
    if (!isOracleEnabled() || !texto || texto.length < 3) return [];
    try {
        const res = await executeOracle(
            `SELECT p.CODPROD, p.DESCRICAO, p.CODAUXILIAR, p.UNIDADE, p.NCM, p.ATIVO
             FROM PCPRODUT p
             WHERE UPPER(p.DESCRICAO) LIKE :busca AND p.ATIVO = 'S'
             FETCH FIRST 20 ROWS ONLY`,
            { busca: `%${texto.toUpperCase()}%` },
            { outFormat: 4002 }
        );
        return (res?.rows ?? []).map(r => ({
            codprod: r.CODPROD, descricao: r.DESCRICAO, ean: r.CODAUXILIAR, unidade: r.UNIDADE, ncm: r.NCM, ativo: r.ATIVO,
        }));
    } catch {
        return [];
    }
}

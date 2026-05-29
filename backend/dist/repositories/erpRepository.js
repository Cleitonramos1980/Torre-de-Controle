import { queryRows } from "./baseRepository.js";
const fallback = {
    clientes: [
        { codcli: "1042", nome: "Magazine Luiza", cgcent: "47.960.950/0001-21", telefones: "(92) 3232-1010", cidade: "Manaus", uf: "AM" },
        { codcli: "2081", nome: "Casas Bahia", cgcent: "33.041.260/0001-65", telefones: "(91) 3344-5566", cidade: "Belem", uf: "PA" },
    ],
    pedidos: [
        { numped: "PED-88421", numnf: "NF-112340", codcli: "1042", dtPedido: "2026-01-10", vlrPedido: 1890, status: "FATURADO", canal: "LOJA" },
        { numped: "PED-77312", numnf: "NF-109877", codcli: "2081", dtPedido: "2026-01-15", vlrPedido: 2450, status: "FATURADO", canal: "ECOMMERCE" },
    ],
    itens: [
        { numped: "PED-88421", numnf: "NF-112340", codprod: "COL-QN-001", descricao: "Colchao Queen Premium", un: "UN", qtd: 2, vlrUnit: 789, vlrTotal: 1578 },
        { numped: "PED-77312", numnf: "NF-109877", codprod: "COL-KG-004", descricao: "Colchao King Luxo", un: "UN", qtd: 1, vlrUnit: 2450, vlrTotal: 2450 },
    ],
    nfVenda: [
        { numnf: "NF-112340", serie: "1", chaveNfe: "35260247960950000121550010001123401001123400", dtEmissao: "2026-01-12", codcli: "1042", numped: "PED-88421", vlrTotal: 1890 },
    ],
    nfTroca: [],
    materiais: [
        { codmat: "MAT-001", descricao: "Mola ensacada D33", un: "UN", categoria: "Molas", estoqueDisponivel: 150 },
        { codmat: "MAT-002", descricao: "Espuma D45", un: "M2", categoria: "Espumas", estoqueDisponivel: 320 },
    ],
    estoquePlanta: [
        { codmat: "MAT-001", planta: "MAO", qtdDisponivel: 80 },
        { codmat: "MAT-001", planta: "BEL", qtdDisponivel: 40 },
        { codmat: "MAT-001", planta: "AGR", qtdDisponivel: 30 },
    ],
};
function normalize(rows) {
    return rows.map((r) => {
        const obj = {};
        for (const [k, v] of Object.entries(r)) {
            const key = k.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            obj[key] = v;
        }
        return obj;
    });
}
export async function getClientes(filters) {
    const rows = await queryRows(`SELECT CODCLI, NOME, CGCENT, TELEFONES, CIDADE, UF
       FROM VW_SGQ_CLIENTE
      WHERE (:nome IS NULL OR UPPER(NOME) LIKE '%' || UPPER(:nome) || '%')
        AND (:cgcent IS NULL OR CGCENT LIKE '%' || :cgcent || '%')
        AND (:telefone IS NULL OR TELEFONES LIKE '%' || :telefone || '%')
      FETCH FIRST 100 ROWS ONLY`, {
        nome: filters.nome || null,
        cgcent: filters.cgcent || null,
        telefone: filters.telefone || null,
    });
    return rows.length ? normalize(rows) : fallback.clientes;
}
export async function getPedidos(codcli) {
    const rows = await queryRows(`SELECT NUMPED, NUMNF, CODCLI, DT_PEDIDO, VLR_PEDIDO, STATUS, CANAL
       FROM VW_SGQ_PEDIDO
      WHERE (:codcli IS NULL OR CODCLI = :codcli)
      FETCH FIRST 200 ROWS ONLY`, { codcli: codcli || null });
    if (rows.length)
        return normalize(rows).map((r) => ({ ...r, dtPedido: String(r.dtPedido).slice(0, 10) }));
    return codcli ? fallback.pedidos.filter((p) => p.codcli === codcli) : fallback.pedidos;
}
export async function getNfVenda(filters) {
    const rows = await queryRows(`SELECT NUMNF, SERIE, CHAVE_NFE, DT_EMISSAO, CODCLI, NUMPED, VLR_TOTAL
       FROM VW_SGQ_NF_VENDA
      WHERE (:codcli IS NULL OR CODCLI = :codcli)
        AND (:numnf IS NULL OR NUMNF = :numnf)
      FETCH FIRST 200 ROWS ONLY`, { codcli: filters.codcli || null, numnf: filters.numnf || null });
    if (rows.length)
        return normalize(rows).map((r) => ({ ...r, dtEmissao: String(r.dtEmissao).slice(0, 10) }));
    return fallback.nfVenda;
}
export async function getNfTroca(filters) {
    const rows = await queryRows(`SELECT NUMNF, SERIE, CHAVE_NFE, DT_EMISSAO, CODCLI, REFERENCIA_TROCA, VLR_TOTAL
       FROM VW_SGQ_NF_TROCA
      WHERE (:codcli IS NULL OR CODCLI = :codcli)
        AND (:numnf IS NULL OR NUMNF = :numnf)
      FETCH FIRST 200 ROWS ONLY`, { codcli: filters.codcli || null, numnf: filters.numnf || null });
    if (rows.length)
        return normalize(rows).map((r) => ({ ...r, dtEmissao: String(r.dtEmissao).slice(0, 10) }));
    return fallback.nfTroca;
}
export async function getPedidoItens(numped) {
    const rows = await queryRows(`SELECT NUMPED, NUMNF, CODPROD, DESCRICAO, UN, QTD, VLR_UNIT, VLR_TOTAL
       FROM VW_SGQ_PEDIDO_ITENS
      WHERE (:numped IS NULL OR NUMPED = :numped)
      FETCH FIRST 500 ROWS ONLY`, { numped: numped || null });
    if (rows.length)
        return normalize(rows);
    return numped ? fallback.itens.filter((i) => i.numped === numped) : fallback.itens;
}
export async function getMateriais(filters) {
    const rows = await queryRows(`SELECT CODMAT, DESCRICAO, UN, CATEGORIA, ESTOQUE_DISPONIVEL
       FROM VW_SGQ_MATERIAL
      WHERE (:codigo IS NULL OR CODMAT LIKE '%' || :codigo || '%')
        AND (:descricao IS NULL OR UPPER(DESCRICAO) LIKE '%' || UPPER(:descricao) || '%')
        AND (:categoria IS NULL OR CATEGORIA = :categoria)
      FETCH FIRST 500 ROWS ONLY`, {
        codigo: filters.codigo || null,
        descricao: filters.descricao || null,
        categoria: filters.categoria || null,
    });
    return rows.length ? normalize(rows) : fallback.materiais;
}
export async function getEstoquePlanta(codmat) {
    const rows = await queryRows(`SELECT CODMAT, PLANTA, QTD_DISPONIVEL
       FROM VW_SGQ_ESTOQUE_PLANTA
      WHERE (:codmat IS NULL OR CODMAT = :codmat)
      FETCH FIRST 500 ROWS ONLY`, { codmat: codmat || null });
    if (rows.length)
        return normalize(rows);
    return codmat ? fallback.estoquePlanta.filter((e) => e.codmat === codmat) : fallback.estoquePlanta;
}
function toDateOnly(value) {
    if (!value)
        return null;
    const raw = String(value);
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
}
function formatCpfCnpj(digits) {
    if (digits.length === 11) {
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
    }
    if (digits.length === 14) {
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
    }
    return null;
}
export async function searchSacClientesDirectOracle(params) {
    const codcliRaw = params.codcli?.trim();
    const cliente = params.cliente?.trim();
    const cgcent = params.cgcent?.trim();
    const cgcentDigits = cgcent ? cgcent.replace(/\D+/g, "") : "";
    const telent = params.telent?.trim();
    const codcli = codcliRaw ? Number(codcliRaw) : null;
    if (!codcliRaw && !cliente && !cgcent && !telent) {
        return [];
    }
    if (codcliRaw && !Number.isFinite(codcli)) {
        return [];
    }
    const clauses = ["pccidade.codcidade = pcclient.codcidade"];
    const binds = {};
    if (codcliRaw) {
        clauses.push("pcclient.codcli = :codcli");
        binds.codcli = codcli;
    }
    if (cliente) {
        clauses.push("UPPER(pcclient.cliente) LIKE '%' || UPPER(:cliente) || '%'");
        binds.cliente = cliente;
    }
    if (cgcent) {
        if (cgcentDigits.length === 11 || cgcentDigits.length === 14) {
            const cgcentMask = formatCpfCnpj(cgcentDigits);
            const values = Array.from(new Set([cgcent, cgcentDigits, cgcentMask].filter(Boolean)));
            const bindNames = [];
            values.forEach((value, idx) => {
                const name = `cgcentEq${idx}`;
                bindNames.push(`:${name}`);
                binds[name] = value;
            });
            clauses.push(`pcclient.cgcent IN (${bindNames.join(", ")})`);
        }
        else {
            clauses.push("pcclient.cgcent LIKE '%' || :cgcent || '%'");
            binds.cgcent = cgcent;
        }
    }
    if (telent) {
        clauses.push("pcclient.telent LIKE '%' || :telent || '%'");
        binds.telent = telent;
    }
    const sql = `SELECT
         pcclient.codcli AS codcli,
         pcclient.cliente AS cliente,
         pcclient.cgcent AS cgcent,
         pccidade.nomecidade AS nomecidade,
         pcclient.telent AS telent,
         pcclient.telent AS telefone
       FROM pcclient, pccidade
       WHERE ${clauses.join("\n         AND ")}
       FETCH FIRST 100 ROWS ONLY`;
    const rows = await queryRows(sql, binds);
    return normalize(rows);
}
export async function getPedidosByCodcli(codcli) {
    const cleaned = codcli?.trim();
    if (!cleaned)
        return [];
    const codcliNumber = Number(cleaned);
    if (!Number.isFinite(codcliNumber))
        return [];
    const rows = await queryRows(`SELECT
       pcpedc.numped AS numped,
       pcpedc.numnota AS numnf,
       pcpedc.data AS dt_pedido,
       pcpedc.vltotal AS vlr_pedido,
       pcpedc.posicao AS status,
       pcpedc.origemped AS canal
     FROM pcpedc
     WHERE pcpedc.codcli = :codcli
     FETCH FIRST 500 ROWS ONLY`, { codcli: codcliNumber });
    return normalize(rows).map((row) => ({
        numped: row.numped,
        numnf: row.numnf,
        dtPedido: toDateOnly(row.dtPedido),
        vlrPedido: row.vlrPedido,
        status: row.status,
        canal: row.canal,
    }));
}
export async function getItensPedidoByNumped(numped) {
    const cleaned = numped?.trim();
    if (!cleaned)
        return [];
    const numpedNumber = Number(cleaned);
    if (!Number.isFinite(numpedNumber))
        return [];
    const rows = await queryRows(`SELECT
       pcpedi.codprod AS codprod,
       pcprodut.descricao AS descricao,
       pcprodut.embalagem AS un,
       pcpedi.qt AS qtd,
       pcpedi.pvenda AS vlr_unit,
       (pcpedi.qt * pcpedi.pvenda) AS vlr_total
     FROM pcpedi, pcprodut
     WHERE pcpedi.codprod = pcprodut.codprod
       AND pcpedi.numped = :numped
     FETCH FIRST 1000 ROWS ONLY`, { numped: numpedNumber });
    return normalize(rows).map((row) => ({
        codprod: row.codprod,
        descricao: row.descricao,
        un: row.un,
        qtd: row.qtd,
        vlrUnit: row.vlrUnit,
        vlrTotal: row.vlrTotal,
    }));
}

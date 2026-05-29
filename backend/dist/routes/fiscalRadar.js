import { executeOracle, isOracleEnabled } from "../db/oracle.js";
import { execDml } from "../repositories/baseRepository.js";
import { ensureFiscalRadarTables } from "../repositories/fiscalRadar/initTables.js";
import { parseNFeXml } from "../services/xmlNfeParser.js";
import { auditarChaveNfe, buscarFornecedorWinthor, consultarPedidoCompra } from "../services/winthorAuditService.js";
import { buscarProdutoWinthor, salvarMapeamentoProduto, buscarProdutosPorDescricao } from "../services/productValidatorService.js";
import { carregarCertificado, consultarNFeSefazCompleto, buscarNFeChaveSefaz } from "../services/sefazService.js";

export { ensureFiscalRadarTables };

// ─── helpers internos ─────────────────────────────────────────────────────────

function ora(v) { return v ?? null; }
function dataOra(v) { return v ? new Date(v) : null; }

async function gravarLog(modulo, acao, cnpj, chave, nsu, usuario, status, mensagem, detalhe) {
    try {
        await executeOracle(
            `INSERT INTO DFE_LOG_PROCESSO
                (MODULO, ACAO, CNPJ_EMPRESA, CHAVE_NFE, NSU, USUARIO, STATUS, MENSAGEM, DETALHE_TECNICO)
             VALUES (:mod, :acao, :cnpj, :chave, :nsu, :usuario, :status, :msg, :det)`,
            {
                mod: (modulo || "").slice(0, 100),
                acao: (acao || "").slice(0, 100),
                cnpj: ora(cnpj),
                chave: ora(chave),
                nsu: ora(nsu),
                usuario: (usuario || "SISTEMA").slice(0, 100),
                status: (status || "OK").slice(0, 50),
                msg: (mensagem || "").slice(0, 4000),
                det: ora(detalhe),
            }
        );
    } catch { /* log never breaks the main flow */ }
}

async function upsertDocumento(parsed, cnpjEmpresa, nsu, xmlRaw) {
    const c = parsed.cabecalho;
    // Verifica se já existe
    const existing = await executeOracle(
        `SELECT ID_DFE, STATUS_MANIFESTACAO FROM DFE_NFE_DOCUMENTO WHERE CNPJ_EMPRESA = :cnpj AND CHAVE_NFE = :chave`,
        { cnpj: cnpjEmpresa, chave: c.chaveAcesso },
        { outFormat: 4002 }
    );
    const existRow = existing?.rows?.[0];

    if (existRow) {
        // Atualiza campos que podem mudar: protocolo, XML completo, datas
        await executeOracle(
            `UPDATE DFE_NFE_DOCUMENTO SET
                NSU = NVL(:nsu, NSU),
                PROTOCOLO_AUTORIZACAO = NVL(:proto, PROTOCOLO_AUTORIZACAO),
                DATA_AUTORIZACAO = NVL(:dtaut, DATA_AUTORIZACAO),
                XML_CLOB = :xml,
                XML_COMPLETO = 'S',
                DATA_PROCESSAMENTO = SYSDATE
             WHERE ID_DFE = :id`,
            {
                nsu: ora(nsu), proto: ora(c.protocoloAutorizacao),
                dtaut: dataOra(c.dataAutorizacao),
                xml: (xmlRaw || "").slice(0, 4000000),
                id: existRow.ID_DFE,
            }
        );
        return { idDfe: existRow.ID_DFE, novo: false };
    }

    // Verifica WinThor
    const auditoria = await auditarChaveNfe(c.chaveAcesso);
    const statusEntrada = auditoria.encontrado ? "LANCADA_WINTHOR" : "BAIXADA_NAO_LANCADA";
    const numtransent = auditoria.entradas[0]?.numTransent || null;

    const ins = await executeOracle(
        `INSERT INTO DFE_NFE_DOCUMENTO (
            CNPJ_EMPRESA, CHAVE_NFE, NSU, TIPO_DOCUMENTO, SCHEMA_XML, MODELO, SERIE, NUMERO_NOTA,
            DATA_EMISSAO, DATA_SAIDA_ENTRADA, NATUREZA_OPERACAO, TIPO_OPERACAO, FINALIDADE_NFE,
            AMBIENTE, CNPJ_EMITENTE, NOME_EMITENTE, IE_EMITENTE, UF_EMITENTE,
            CNPJ_DESTINATARIO, NOME_DESTINATARIO, UF_DESTINATARIO,
            VALOR_PRODUTOS, VALOR_FRETE, VALOR_SEGURO, VALOR_DESCONTO, VALOR_TOTAL_NFE,
            PROTOCOLO_AUTORIZACAO, DATA_AUTORIZACAO,
            STATUS_NFE, STATUS_MANIFESTACAO, STATUS_ENTRADA,
            XML_CLOB, XML_COMPLETO, DATA_DOWNLOAD,
            NUMTRANSENT_WINTHOR
         ) VALUES (
            :cnpjEmp, :chave, :nsu, :tipo, :schema, :modelo, :serie, :numero,
            :dtEmis, :dtSaida, :natOp, :tpNf, :finNfe,
            :amb, :cnpjEmit, :nomeEmit, :ieEmit, :ufEmit,
            :cnpjDest, :nomeDest, :ufDest,
            :vProd, :vFrete, :vSeg, :vDesc, :vNf,
            :proto, :dtAut,
            'AUTORIZADA', 'PENDENTE', :stEnt,
            :xml, 'S', SYSDATE,
            :numtrans
         ) RETURNING ID_DFE INTO :idDfe`,
        {
            cnpjEmp: cnpjEmpresa, chave: c.chaveAcesso, nsu: ora(nsu),
            tipo: c.tipoDocumento || "PROCNFE", schema: ora(c.schemaXml),
            modelo: c.modelo, serie: c.serie, numero: c.numeroNota,
            dtEmis: dataOra(c.dataEmissao), dtSaida: dataOra(c.dataSaidaEntrada),
            natOp: (c.naturezaOperacao || "").slice(0, 200),
            tpNf: c.tipoOperacao, finNfe: c.finalidadeNfe,
            amb: c.ambiente,
            cnpjEmit: c.cnpjEmitente, nomeEmit: (c.nomeEmitente || "").slice(0, 200),
            ieEmit: (c.ieEmitente || "").slice(0, 30), ufEmit: c.ufEmitente,
            cnpjDest: c.cnpjDestinatario, nomeDest: (c.nomeDestinatario || "").slice(0, 200),
            ufDest: c.ufDestinatario,
            vProd: c.valorProdutos, vFrete: c.valorFrete, vSeg: c.valorSeguro,
            vDesc: c.valorDesconto, vNf: c.valorTotalNfe,
            proto: ora(c.protocoloAutorizacao), dtAut: dataOra(c.dataAutorizacao),
            stEnt: statusEntrada,
            xml: (xmlRaw || "").slice(0, 4000000),
            numtrans: ora(numtransent),
            idDfe: { type: 2002, dir: 3003 }, // NUMBER OUT
        }
    );
    const idDfe = ins?.outBinds?.idDfe?.[0] ?? null;
    return { idDfe, novo: true, statusEntrada, auditoria };
}

async function persistirItens(idDfe, chave, cnpjEmpresa, itens) {
    // Remove itens anteriores (re-processamento)
    await executeOracle(`DELETE FROM DFE_NFE_IMPOSTO_ITEM WHERE ID_DFE = :id`, { id: idDfe }).catch(() => {});
    await executeOracle(`DELETE FROM DFE_NFE_ITEM WHERE ID_DFE = :id`, { id: idDfe }).catch(() => {});

    for (const item of itens) {
        // Busca produto WinThor
        const pv = await buscarProdutoWinthor({
            ean: item.eanComercial,
            codProdFornecedor: item.codProdFornecedor,
            cnpjFornecedor: null,
        });
        const statusCad = pv.encontrado ? "ENCONTRADO_WINTHOR" : "NAO_ENCONTRADO";
        const codprodWinthor = pv.encontrado ? pv.produtos[0]?.codprod : null;
        const descWinthor    = pv.encontrado ? pv.produtos[0]?.descricao : null;
        const unidWinthor    = pv.encontrado ? pv.produtos[0]?.unidade : null;
        const ncmWinthor     = pv.encontrado ? pv.produtos[0]?.ncm : null;

        const insItem = await executeOracle(
            `INSERT INTO DFE_NFE_ITEM (
                ID_DFE, CHAVE_NFE, CNPJ_EMPRESA, NUM_ITEM,
                COD_PROD_FORNECEDOR, EAN_COMERCIAL, DESCRICAO_XML,
                NCM, CEST, CFOP, UNIDADE_COMERCIAL,
                QTDE_COMERCIAL, VALOR_UNITARIO, VALOR_TOTAL_ITEM,
                EAN_TRIBUTAVEL, UNIDADE_TRIBUTAVEL, QTDE_TRIBUTAVEL, VALOR_UNIT_TRIB,
                VALOR_FRETE, VALOR_SEGURO, VALOR_DESCONTO, VALOR_OUTRAS_DESP, IND_TOTAL,
                CODPROD_WINTHOR, DESCRICAO_WINTHOR, UNIDADE_WINTHOR, NCM_WINTHOR,
                STATUS_CADASTRO, DATA_PROCESSAMENTO
             ) VALUES (
                :idDfe, :chave, :cnpj, :numItem,
                :codProd, :ean, :desc,
                :ncm, :cest, :cfop, :unid,
                :qtde, :vUnit, :vTot,
                :eanTrib, :unidTrib, :qtdeTrib, :vUnitTrib,
                :vFret, :vSeg, :vDesc, :vOutro, :indTot,
                :codwint, :descwint, :unidwint, :ncmwint,
                :stCad, SYSDATE
             ) RETURNING ID_ITEM INTO :idItem`,
            {
                idDfe, chave, cnpj: cnpjEmpresa, numItem: item.numItem,
                codProd: (item.codProdFornecedor || "").slice(0, 100),
                ean: (item.eanComercial || "").slice(0, 30),
                desc: (item.descricaoXml || "").slice(0, 500),
                ncm: (item.ncm || "").slice(0, 20),
                cest: (item.cest || "").slice(0, 20),
                cfop: (item.cfop || "").slice(0, 10),
                unid: (item.unidadeComercial || "").slice(0, 20),
                qtde: item.qtdeComercial, vUnit: item.valorUnitario, vTot: item.valorTotalItem,
                eanTrib: (item.eanTributavel || "").slice(0, 30),
                unidTrib: (item.unidadeTributavel || "").slice(0, 20),
                qtdeTrib: item.qtdeTributavel, vUnitTrib: item.valorUnitTrib,
                vFret: item.valorFrete, vSeg: item.valorSeguro, vDesc: item.valorDesconto,
                vOutro: item.valorOutrasDesp, indTot: item.indTotal || "1",
                codwint: ora(codprodWinthor), descwint: ora(descWinthor),
                unidwint: ora(unidWinthor), ncmwint: ora(ncmWinthor),
                stCad: statusCad,
                idItem: { type: 2002, dir: 3003 },
            }
        );
        const idItem = insItem?.outBinds?.idItem?.[0] ?? null;

        // Impostos do item
        if (idItem) {
            for (const imp of (item.impostos || [])) {
                await executeOracle(
                    `INSERT INTO DFE_NFE_IMPOSTO_ITEM (
                        ID_ITEM, ID_DFE, CHAVE_NFE, NUM_ITEM,
                        TIPO_IMPOSTO, GRUPO_IMPOSTO, CST, CSOSN, ORIGEM_PROD,
                        BASE_CALCULO, ALIQUOTA, VALOR_IMPOSTO,
                        BASE_ST, ALIQUOTA_ST, VALOR_ST, VALOR_DESONERADO
                     ) VALUES (
                        :idItem, :idDfe, :chave, :numItem,
                        :tipoImp, :grupoImp, :cst, :csosn, :orig,
                        :bc, :aliq, :vImp,
                        :bcSt, :aliqSt, :vSt, :vDes
                     )`,
                    {
                        idItem, idDfe, chave, numItem: item.numItem,
                        tipoImp: (imp.tipoImposto || "").slice(0, 30),
                        grupoImp: (imp.grupo || "").slice(0, 50),
                        cst: (imp.cst || "").slice(0, 10),
                        csosn: (imp.csosn || "").slice(0, 10),
                        orig: (imp.origemProd || "").slice(0, 10),
                        bc: imp.baseCalculo, aliq: imp.aliquota, vImp: imp.valorImposto,
                        bcSt: imp.baseSt, aliqSt: imp.aliquotaSt, vSt: imp.valorSt,
                        vDes: imp.valorDesonerado,
                    }
                ).catch(() => {});
            }
        }
    }
}

async function persistirTotais(idDfe, chave, totais) {
    await executeOracle(`DELETE FROM DFE_NFE_TOTAL WHERE ID_DFE = :id`, { id: idDfe }).catch(() => {});
    await executeOracle(
        `INSERT INTO DFE_NFE_TOTAL (
            ID_DFE, CHAVE_NFE,
            V_BC, V_ICMS, V_ICMS_DESON, V_FCP, V_BC_ST, V_ST, V_FCP_ST,
            V_PROD, V_FRETE, V_SEG, V_DESC, V_II, V_IPI, V_PIS, V_COFINS, V_OUTRO, V_NF
         ) VALUES (
            :idDfe, :chave,
            :vBc, :vIcms, :vIcmsDeson, :vFcp, :vBcSt, :vSt, :vFcpSt,
            :vProd, :vFrete, :vSeg, :vDesc, :vIi, :vIpi, :vPis, :vCofins, :vOutro, :vNf
         )`,
        {
            idDfe, chave,
            vBc: totais.vBc, vIcms: totais.vIcms, vIcmsDeson: totais.vIcmsDeson,
            vFcp: totais.vFcp, vBcSt: totais.vBcSt, vSt: totais.vSt, vFcpSt: totais.vFcpSt,
            vProd: totais.vProd, vFrete: totais.vFrete, vSeg: totais.vSeg,
            vDesc: totais.vDesc, vIi: totais.vIi, vIpi: totais.vIpi,
            vPis: totais.vPis, vCofins: totais.vCofins, vOutro: totais.vOutro, vNf: totais.vNf,
        }
    ).catch(() => {});
}

async function persistirTransporte(idDfe, chave, transp) {
    await executeOracle(`DELETE FROM DFE_NFE_TRANSPORTE WHERE ID_DFE = :id`, { id: idDfe }).catch(() => {});
    await executeOracle(
        `INSERT INTO DFE_NFE_TRANSPORTE (ID_DFE, CHAVE_NFE, MOD_FRETE, CNPJ_TRANSP, NOME_TRANSP, PLACA, QTD_VOL, PESO_LIQ, PESO_BRT)
         VALUES (:id, :chave, :mf, :cnpj, :nome, :placa, :qtd, :pliq, :pbrt)`,
        { id: idDfe, chave, mf: transp.modFrete || "9", cnpj: ora(transp.cnpjTransp), nome: ora(transp.nomeTransp), placa: ora(transp.placa), qtd: transp.qtdVol, pliq: transp.pesoLiq, pbrt: transp.pesoBrt }
    ).catch(() => {});
}

async function persistirCobrancas(idDfe, chave, cobrancas) {
    await executeOracle(`DELETE FROM DFE_NFE_COBRANCA WHERE ID_DFE = :id`, { id: idDfe }).catch(() => {});
    for (const c of cobrancas) {
        await executeOracle(
            `INSERT INTO DFE_NFE_COBRANCA (ID_DFE, CHAVE_NFE, TIPO, NUM_FAT, NUM_DUP, DT_VENC, VALOR, TPAG, VPAG)
             VALUES (:id, :chave, :tipo, :nfat, :ndup, :dv, :val, :tp, :vp)`,
            { id: idDfe, chave, tipo: c.tipo, nfat: ora(c.numFat), ndup: ora(c.numDup), dv: dataOra(c.dtVenc), val: c.valor, tp: ora(c.tpag), vp: c.vpag }
        ).catch(() => {});
    }
}

// ─── processamento completo de um XML ─────────────────────────────────────────

async function processarXml(xmlRaw, cnpjEmpresa, nsu) {
    const parsed = parseNFeXml(xmlRaw);
    if (!parsed) return null;

    const { idDfe, novo, statusEntrada, auditoria } = await upsertDocumento(parsed, cnpjEmpresa, nsu, xmlRaw);
    if (!idDfe) return null;

    await persistirItens(idDfe, parsed.cabecalho.chaveAcesso, cnpjEmpresa, parsed.itens);
    await persistirTotais(idDfe, parsed.cabecalho.chaveAcesso, parsed.totais);
    await persistirTransporte(idDfe, parsed.cabecalho.chaveAcesso, parsed.transporte);
    await persistirCobrancas(idDfe, parsed.cabecalho.chaveAcesso, parsed.cobrancas);

    return { idDfe, novo, chave: parsed.cabecalho.chaveAcesso, statusEntrada };
}

// ─── registro de rotas ────────────────────────────────────────────────────────

export async function fiscalRadarRoutes(app) {

    // GET /api/fiscal/radar/status — status geral + empresas com certificado
    app.get("/api/fiscal/radar/status", async (req, reply) => {
        if (!isOracleEnabled()) return reply.send({ oracle: false, controles: [], empresas: [] });
        try {
            const [ctrlRes, empRes] = await Promise.all([
                executeOracle(
                    `SELECT c.ID_CONTROLE, c.CNPJ_EMPRESA, c.AMBIENTE, c.ULT_NSU, c.MAX_NSU,
                            c.DT_ULT_CONSULTA, c.CSTAT_ULTIMO, c.XMOTIVO_ULTIMO,
                            c.BLOQUEADO_ATE, c.STATUS, c.QTD_DOC_ULT_CONS
                     FROM DFE_NSU_CONTROLE c
                     ORDER BY c.CNPJ_EMPRESA`,
                    {}, { outFormat: 4002 }
                ),
                executeOracle(
                    `SELECT REGEXP_REPLACE(f.CGC, '[^0-9]', '') AS CNPJ,
                            f.NOMEFANTASIA AS NOME, f.CODFILIAL
                     FROM PCFILIAL f
                     WHERE f.CERTIFICADOA1 IS NOT NULL
                       AND REGEXP_REPLACE(f.CGC, '[^0-9]', '') IS NOT NULL
                     ORDER BY f.CODFILIAL`,
                    {}, { outFormat: 4002 }
                ).catch(() => ({ rows: [] })),
            ]);

            const controles = (ctrlRes?.rows ?? []).map(r => ({
                id: r.ID_CONTROLE, cnpj: r.CNPJ_EMPRESA, ambiente: r.AMBIENTE,
                ultNsu: r.ULT_NSU, maxNsu: r.MAX_NSU,
                dtUltConsulta: r.DT_ULT_CONSULTA, cstatUltimo: r.CSTAT_ULTIMO,
                xmotivoUltimo: r.XMOTIVO_ULTIMO,
                bloqueadoAte: r.BLOQUEADO_ATE, status: r.STATUS,
                qtdDocUltCons: r.QTD_DOC_ULT_CONS,
            }));

            // Merge: empresas com cert + empresas que já têm controle NSU
            const empresasMap = new Map();
            for (const r of (empRes?.rows ?? [])) {
                const cnpj = (r.CNPJ || "").padStart(14, "0");
                if (cnpj.length === 14) empresasMap.set(cnpj, { cnpj, nome: r.NOME || cnpj, codFilial: r.CODFILIAL, temCertificado: true });
            }
            for (const c of controles) {
                if (!empresasMap.has(c.cnpj)) empresasMap.set(c.cnpj, { cnpj: c.cnpj, nome: c.cnpj, temCertificado: false });
            }

            return reply.send({ oracle: true, controles, empresas: [...empresasMap.values()] });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // GET /api/fiscal/radar/documentos — lista paginada de NF-e
    app.get("/api/fiscal/radar/documentos", async (req, reply) => {
        if (!isOracleEnabled()) return reply.send({ total: 0, pagina: 1, registros: [] });
        const q = req.query;
        const pagina  = Math.max(1, parseInt(q.pagina) || 1);
        const limite  = Math.min(100, parseInt(q.limite) || 50);
        const offset  = (pagina - 1) * limite;

        const binds = {};
        const filtros = [];

        if (q.cnpjEmpresa) { filtros.push(`d.CNPJ_EMPRESA = :cnpjEmp`); binds.cnpjEmp = q.cnpjEmpresa.replace(/\D/g, ""); }
        if (q.cnpjEmitente) { filtros.push(`d.CNPJ_EMITENTE = :cnpjEmit`); binds.cnpjEmit = q.cnpjEmitente.replace(/\D/g, ""); }
        if (q.statusEntrada) { filtros.push(`d.STATUS_ENTRADA = :stEnt`); binds.stEnt = q.statusEntrada; }
        if (q.statusManifestacao) { filtros.push(`d.STATUS_MANIFESTACAO = :stMan`); binds.stMan = q.statusManifestacao; }
        if (q.statusNfe) { filtros.push(`d.STATUS_NFE = :stNfe`); binds.stNfe = q.statusNfe; }
        if (q.dataInicio) { filtros.push(`d.DATA_EMISSAO >= :dtIni`); binds.dtIni = new Date(q.dataInicio); }
        if (q.dataFim) { filtros.push(`d.DATA_EMISSAO <= :dtFim`); binds.dtFim = new Date(q.dataFim + "T23:59:59"); }
        if (q.busca) {
            filtros.push(`(UPPER(d.NOME_EMITENTE) LIKE :busca OR d.CNPJ_EMITENTE LIKE :busca OR d.CHAVE_NFE LIKE :busca)`);
            binds.busca = `%${q.busca.toUpperCase()}%`;
        }
        if (q.apenasNaoLancadas === "true") {
            filtros.push(`d.STATUS_ENTRADA NOT IN ('LANCADA_WINTHOR')`);
        }

        const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

        try {
            const cntRes = await executeOracle(
                `SELECT COUNT(*) AS TOTAL FROM DFE_NFE_DOCUMENTO d ${where}`,
                binds, { outFormat: 4002 }
            );
            const total = cntRes?.rows?.[0]?.TOTAL ?? 0;

            const res = await executeOracle(
                `SELECT d.ID_DFE, d.CNPJ_EMPRESA, d.CHAVE_NFE, d.NSU,
                        d.MODELO, d.SERIE, d.NUMERO_NOTA, d.DATA_EMISSAO,
                        d.NATUREZA_OPERACAO, d.TIPO_OPERACAO,
                        d.CNPJ_EMITENTE, d.NOME_EMITENTE, d.UF_EMITENTE,
                        d.CNPJ_DESTINATARIO, d.NOME_DESTINATARIO,
                        d.VALOR_TOTAL_NFE, d.PROTOCOLO_AUTORIZACAO,
                        d.STATUS_NFE, d.STATUS_MANIFESTACAO, d.STATUS_ENTRADA,
                        d.XML_COMPLETO, d.DATA_DOWNLOAD, d.NUMTRANSENT_WINTHOR,
                        d.OBSERVACAO
                 FROM DFE_NFE_DOCUMENTO d
                 ${where}
                 ORDER BY d.DATA_EMISSAO DESC NULLS LAST, d.ID_DFE DESC
                 OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`,
                { ...binds, off: offset, lim: limite },
                { outFormat: 4002 }
            );

            const registros = (res?.rows ?? []).map(r => ({
                idDfe: r.ID_DFE, cnpjEmpresa: r.CNPJ_EMPRESA, chave: r.CHAVE_NFE, nsu: r.NSU,
                modelo: r.MODELO, serie: r.SERIE, numero: r.NUMERO_NOTA,
                dataEmissao: r.DATA_EMISSAO, naturezaOperacao: r.NATUREZA_OPERACAO,
                tipoOperacao: r.TIPO_OPERACAO,
                cnpjEmitente: r.CNPJ_EMITENTE, nomeEmitente: r.NOME_EMITENTE, ufEmitente: r.UF_EMITENTE,
                cnpjDestinatario: r.CNPJ_DESTINATARIO, nomeDestinatario: r.NOME_DESTINATARIO,
                valorTotal: r.VALOR_TOTAL_NFE, protocolo: r.PROTOCOLO_AUTORIZACAO,
                statusNfe: r.STATUS_NFE, statusManifestacao: r.STATUS_MANIFESTACAO, statusEntrada: r.STATUS_ENTRADA,
                xmlCompleto: r.XML_COMPLETO, dataDownload: r.DATA_DOWNLOAD,
                numtransent: r.NUMTRANSENT_WINTHOR, observacao: r.OBSERVACAO,
            }));

            return reply.send({ total, pagina, limite, registros });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // GET /api/fiscal/radar/documentos/:idDfe — detalhe completo
    app.get("/api/fiscal/radar/documentos/:idDfe", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const idDfe = parseInt(req.params.idDfe);
        if (!idDfe) return reply.status(400).send({ error: "ID inválido" });

        try {
            const [docRes, itensRes, totRes, transpRes, cobrRes, evtRes] = await Promise.all([
                executeOracle(`SELECT d.ID_DFE, d.CNPJ_EMPRESA, d.CHAVE_NFE, d.NSU, d.TIPO_DOCUMENTO,
                                      d.MODELO, d.SERIE, d.NUMERO_NOTA, d.DATA_EMISSAO, d.DATA_SAIDA_ENTRADA,
                                      d.NATUREZA_OPERACAO, d.TIPO_OPERACAO, d.FINALIDADE_NFE, d.AMBIENTE,
                                      d.CNPJ_EMITENTE, d.NOME_EMITENTE, d.IE_EMITENTE, d.UF_EMITENTE,
                                      d.CNPJ_DESTINATARIO, d.NOME_DESTINATARIO, d.UF_DESTINATARIO,
                                      d.VALOR_PRODUTOS, d.VALOR_FRETE, d.VALOR_SEGURO, d.VALOR_DESCONTO, d.VALOR_TOTAL_NFE,
                                      d.PROTOCOLO_AUTORIZACAO, d.DATA_AUTORIZACAO,
                                      d.STATUS_NFE, d.STATUS_MANIFESTACAO, d.STATUS_ENTRADA, d.STATUS_PRODUTOS,
                                      d.XML_CLOB, d.XML_COMPLETO, d.DATA_DOWNLOAD, d.DATA_PROCESSAMENTO,
                                      d.CODFORNEC_WINTHOR, d.NUMTRANSENT_WINTHOR, d.OBSERVACAO
                               FROM DFE_NFE_DOCUMENTO d WHERE d.ID_DFE = :id`,
                    { id: idDfe }, { outFormat: 4002 }),

                executeOracle(`SELECT i.ID_ITEM, i.NUM_ITEM, i.COD_PROD_FORNECEDOR, i.EAN_COMERCIAL,
                                      i.DESCRICAO_XML, i.NCM, i.CEST, i.CFOP, i.UNIDADE_COMERCIAL,
                                      i.QTDE_COMERCIAL, i.VALOR_UNITARIO, i.VALOR_TOTAL_ITEM,
                                      i.CODPROD_WINTHOR, i.DESCRICAO_WINTHOR, i.UNIDADE_WINTHOR, i.NCM_WINTHOR,
                                      i.STATUS_CADASTRO, i.STATUS_VALIDACAO, i.OBSERVACAO
                               FROM DFE_NFE_ITEM i WHERE i.ID_DFE = :id ORDER BY i.NUM_ITEM`,
                    { id: idDfe }, { outFormat: 4002 }),

                executeOracle(`SELECT t.V_BC, t.V_ICMS, t.V_ICMS_DESON, t.V_FCP, t.V_BC_ST, t.V_ST, t.V_FCP_ST,
                                      t.V_PROD, t.V_FRETE, t.V_SEG, t.V_DESC, t.V_II, t.V_IPI,
                                      t.V_PIS, t.V_COFINS, t.V_OUTRO, t.V_NF
                               FROM DFE_NFE_TOTAL t WHERE t.ID_DFE = :id`,
                    { id: idDfe }, { outFormat: 4002 }),

                executeOracle(`SELECT tr.MOD_FRETE, tr.CNPJ_TRANSP, tr.NOME_TRANSP, tr.PLACA,
                                      tr.QTD_VOL, tr.PESO_LIQ, tr.PESO_BRT
                               FROM DFE_NFE_TRANSPORTE tr WHERE tr.ID_DFE = :id`,
                    { id: idDfe }, { outFormat: 4002 }),

                executeOracle(`SELECT c.ID_COBR, c.TIPO, c.NUM_FAT, c.NUM_DUP, c.DT_VENC, c.VALOR, c.TPAG, c.VPAG
                               FROM DFE_NFE_COBRANCA c WHERE c.ID_DFE = :id ORDER BY c.ID_COBR`,
                    { id: idDfe }, { outFormat: 4002 }),

                executeOracle(`SELECT e.ID_EVENTO, e.TIPO_EVENTO, e.DESC_EVENTO, e.NUM_SEQUENCIAL,
                                      e.DT_EVENTO, e.PROTOCOLO, e.JUSTIFICATIVA, e.STATUS, e.DATA_GRAVACAO
                               FROM DFE_NFE_EVENTO e WHERE e.ID_DFE = :id ORDER BY e.DATA_GRAVACAO`,
                    { id: idDfe }, { outFormat: 4002 }),
            ]);

            const doc = docRes?.rows?.[0];
            if (!doc) return reply.status(404).send({ error: "Documento não encontrado" });

            return reply.send({
                documento: doc,
                itens: itensRes?.rows ?? [],
                totais: totRes?.rows?.[0] ?? null,
                transporte: transpRes?.rows?.[0] ?? null,
                cobrancas: cobrRes?.rows ?? [],
                eventos: evtRes?.rows ?? [],
            });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // POST /api/fiscal/radar/sync — busca NF-e no SEFAZ via DFe-Nacional
    app.post("/api/fiscal/radar/sync", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const { cnpjEmpresa, maxLotes = 5 } = req.body ?? {};
        if (!cnpjEmpresa) return reply.status(400).send({ error: "cnpjEmpresa obrigatório" });
        const cnpj = cnpjEmpresa.replace(/\D/g, "");
        const usuario = req.authUser?.matricula || req.authUser?.nome || "SISTEMA";

        try {
            // Carrega certificado digital
            let cert;
            try {
                cert = await carregarCertificado(cnpj);
            } catch (eCert) {
                return reply.status(422).send({ error: `Certificado não disponível: ${eCert.message}` });
            }

            // Obtém NSU atual
            const ctrlRes = await executeOracle(
                `SELECT c.ID_CONTROLE, c.ULT_NSU, c.BLOQUEADO_ATE, c.STATUS
                 FROM DFE_NSU_CONTROLE c
                 WHERE c.CNPJ_EMPRESA = :cnpj AND c.AMBIENTE = 1 AND ROWNUM = 1`,
                { cnpj }, { outFormat: 4002 }
            );
            let ctrl = ctrlRes?.rows?.[0];
            if (!ctrl) {
                await executeOracle(
                    `INSERT INTO DFE_NSU_CONTROLE (CNPJ_EMPRESA, AMBIENTE, ULT_NSU) VALUES (:cnpj, 1, '000000000000000')`,
                    { cnpj }
                );
                ctrl = { ULT_NSU: "000000000000000", BLOQUEADO_ATE: null, STATUS: "ATIVO" };
            }

            // Verifica bloqueio
            if (ctrl.BLOQUEADO_ATE && new Date(ctrl.BLOQUEADO_ATE) > new Date()) {
                return reply.status(429).send({ error: `SEFAZ bloqueado até ${ctrl.BLOQUEADO_ATE}` });
            }

            let importados = 0;
            let erros = 0;
            let ultNsuFinal = ctrl.ULT_NSU;
            let maxNsu = null;

            await consultarNFeSefazCompleto(cnpj, ctrl.ULT_NSU, maxLotes, async (lote) => {
                const { nsu, maxNsuLote, documentos } = lote;
                if (maxNsuLote) maxNsu = maxNsuLote;

                for (const doc of (documentos || [])) {
                    try {
                        const result = await processarXml(doc.xml, cnpj, doc.nsu);
                        if (result) importados++;
                    } catch (eDoc) {
                        erros++;
                        await gravarLog("FISCAL_RADAR", "SYNC_SEFAZ_DOC_ERROR", cnpj, null, doc.nsu, usuario, "ERRO", eDoc.message, eDoc.stack);
                    }
                }
                if (nsu) ultNsuFinal = nsu;
            });

            // Atualiza controle NSU
            await executeOracle(
                `UPDATE DFE_NSU_CONTROLE SET
                    ULT_NSU = :nsu, MAX_NSU = NVL(:maxNsu, MAX_NSU),
                    DT_ULT_CONSULTA = SYSDATE, QTD_DOC_ULT_CONS = :qtd
                 WHERE CNPJ_EMPRESA = :cnpj AND AMBIENTE = 1`,
                { nsu: ultNsuFinal, maxNsu: ora(maxNsu), qtd: importados, cnpj }
            );

            await gravarLog("FISCAL_RADAR", "SYNC_SEFAZ", cnpj, null, ultNsuFinal, usuario, "OK",
                `Importados: ${importados}, Erros: ${erros}`, null);

            return reply.send({ importados, erros, ultNsu: ultNsuFinal, maxNsu });
        } catch (e) {
            await gravarLog("FISCAL_RADAR", "SYNC_SEFAZ", cnpj, null, null, usuario, "ERRO", e.message, e.stack);
            return reply.status(500).send({ error: e.message });
        }
    });

    // POST /api/fiscal/radar/sync/pcdoc — importa de PCDOCELETRONICO (sem certificado)
    app.post("/api/fiscal/radar/sync/pcdoc", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const { cnpjEmpresa, limite: limiteReq = 200 } = req.body ?? {};
        const usuario = req.authUser?.matricula || req.authUser?.nome || "SISTEMA";
        const limite = Math.min(500, parseInt(limiteReq) || 200);

        try {
            const cnpjFilter = cnpjEmpresa ? `AND REGEXP_REPLACE(f.CGC, '[^0-9]', '') = '${cnpjEmpresa.replace(/\D/g, "")}'` : "";

            const res = await executeOracle(
                `SELECT d.XMLNFE, d.CODFILIAL, NVL(d.NUMTRANSACAO, 0) AS NUMTRANSACAO
                 FROM PCDOCELETRONICO d
                 LEFT JOIN PCFILIAL f ON f.CODFILIAL = d.CODFILIAL
                 WHERE d.XMLNFE IS NOT NULL
                   AND (d.NUMTRANSACAO IS NULL OR d.NUMTRANSACAO = 0)
                   ${cnpjFilter}
                 ORDER BY d.ROWID DESC
                 FETCH FIRST :lim ROWS ONLY`,
                { lim: limite },
                { outFormat: 4002 }
            );

            let importados = 0, ignorados = 0, erros = 0;
            const cnpjDestino = cnpjEmpresa?.replace(/\D/g, "") || "00000000000000";

            for (const row of (res?.rows ?? [])) {
                try {
                    const xmlStr = typeof row.XMLNFE === "string" ? row.XMLNFE : String(row.XMLNFE ?? "");
                    if (!xmlStr || xmlStr.length < 100) { ignorados++; continue; }
                    const result = await processarXml(xmlStr, cnpjDestino, null);
                    if (result) { if (result.novo) importados++; else ignorados++; }
                    else ignorados++;
                } catch (eDoc) {
                    erros++;
                    await gravarLog("FISCAL_RADAR", "SYNC_PCDOC_ERROR", cnpjDestino, null, null, usuario, "ERRO", eDoc.message, null);
                }
            }

            return reply.send({ importados, ignorados, erros, lidos: res?.rows?.length ?? 0 });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // POST /api/fiscal/radar/documentos/:idDfe/manifestar — manifestação da NF-e
    app.post("/api/fiscal/radar/documentos/:idDfe/manifestar", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const idDfe = parseInt(req.params.idDfe);
        const { tipoEvento, justificativa } = req.body ?? {};
        const usuario = req.authUser?.matricula || req.authUser?.nome || "SISTEMA";

        const tiposValidos = {
            "210210": { desc: "Ciência da Operação",     status: "CIENTE" },
            "210240": { desc: "Confirmação da Operação", status: "CONFIRMADA" },
            "210220": { desc: "Desconhecimento",         status: "DESCONHECIDA" },
            "210230": { desc: "Operação não Realizada",  status: "NAO_REALIZADA" },
        };
        if (!tiposValidos[tipoEvento]) return reply.status(400).send({ error: "tipoEvento inválido" });
        if (tipoEvento === "210230" && !justificativa) return reply.status(400).send({ error: "Justificativa obrigatória para Operação não Realizada" });

        try {
            const docRes = await executeOracle(
                `SELECT d.ID_DFE, d.CHAVE_NFE, d.CNPJ_EMPRESA, d.STATUS_MANIFESTACAO
                 FROM DFE_NFE_DOCUMENTO d WHERE d.ID_DFE = :id`,
                { id: idDfe }, { outFormat: 4002 }
            );
            const doc = docRes?.rows?.[0];
            if (!doc) return reply.status(404).send({ error: "Documento não encontrado" });

            const { desc, status } = tiposValidos[tipoEvento];

            // Registra evento
            await executeOracle(
                `INSERT INTO DFE_NFE_EVENTO (ID_DFE, CHAVE_NFE, CNPJ_EMPRESA, TIPO_EVENTO, DESC_EVENTO, DT_EVENTO, STATUS, JUSTIFICATIVA)
                 VALUES (:id, :chave, :cnpj, :tipo, :desc, SYSDATE, 'PENDENTE', :just)`,
                { id: idDfe, chave: doc.CHAVE_NFE, cnpj: doc.CNPJ_EMPRESA, tipo: tipoEvento, desc, just: justificativa || null }
            );

            // Atualiza status da NF-e (apenas se for confirmação/desconhecimento/nao realizada)
            if (["210240", "210220", "210230"].includes(tipoEvento)) {
                await executeOracle(
                    `UPDATE DFE_NFE_DOCUMENTO SET STATUS_MANIFESTACAO = :st WHERE ID_DFE = :id`,
                    { st: status, id: idDfe }
                );
            } else if (tipoEvento === "210210") {
                await executeOracle(
                    `UPDATE DFE_NFE_DOCUMENTO SET STATUS_MANIFESTACAO = 'CIENTE' WHERE ID_DFE = :id AND STATUS_MANIFESTACAO = 'PENDENTE'`,
                    { id: idDfe }
                );
            }

            await gravarLog("FISCAL_RADAR", `MANIFESTAR_${tipoEvento}`, doc.CNPJ_EMPRESA, doc.CHAVE_NFE, null, usuario, "OK",
                `${desc} registrada`, null);

            return reply.send({ ok: true, status, descEvento: desc });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // POST /api/fiscal/radar/documentos/:idDfe/observacao — salvar observação
    app.post("/api/fiscal/radar/documentos/:idDfe/observacao", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const idDfe = parseInt(req.params.idDfe);
        const { observacao } = req.body ?? {};
        try {
            await executeOracle(
                `UPDATE DFE_NFE_DOCUMENTO SET OBSERVACAO = :obs WHERE ID_DFE = :id`,
                { obs: (observacao || "").slice(0, 4000), id: idDfe }
            );
            return reply.send({ ok: true });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // POST /api/fiscal/radar/documentos/:idDfe/auditoria — audita no WinThor
    app.post("/api/fiscal/radar/documentos/:idDfe/auditoria", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const idDfe = parseInt(req.params.idDfe);
        try {
            const docRes = await executeOracle(
                `SELECT d.CHAVE_NFE, d.CNPJ_EMITENTE, d.NUMERO_NOTA, d.CNPJ_EMPRESA
                 FROM DFE_NFE_DOCUMENTO d WHERE d.ID_DFE = :id`,
                { id: idDfe }, { outFormat: 4002 }
            );
            const doc = docRes?.rows?.[0];
            if (!doc) return reply.status(404).send({ error: "Documento não encontrado" });

            const [auditoria, fornecedor, pedidos] = await Promise.all([
                auditarChaveNfe(doc.CHAVE_NFE),
                buscarFornecedorWinthor(doc.CNPJ_EMITENTE),
                consultarPedidoCompra(doc.CNPJ_EMITENTE, doc.NUMERO_NOTA, null),
            ]);

            const newStatus = auditoria.encontrado ? "LANCADA_WINTHOR" : "BAIXADA_NAO_LANCADA";
            await executeOracle(
                `UPDATE DFE_NFE_DOCUMENTO SET STATUS_ENTRADA = :st, NUMTRANSENT_WINTHOR = :nt, CODFORNEC_WINTHOR = :cf WHERE ID_DFE = :id`,
                { st: newStatus, nt: auditoria.entradas[0]?.numTransent || null, cf: fornecedor?.codFornec || null, id: idDfe }
            );

            return reply.send({ auditoria, fornecedor, pedidos, statusEntrada: newStatus });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // GET /api/fiscal/radar/itens/:idDfe — itens com validação de produtos
    app.get("/api/fiscal/radar/itens/:idDfe", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const idDfe = parseInt(req.params.idDfe);
        try {
            const res = await executeOracle(
                `SELECT i.ID_ITEM, i.NUM_ITEM, i.COD_PROD_FORNECEDOR, i.EAN_COMERCIAL,
                        i.DESCRICAO_XML, i.NCM, i.CEST, i.CFOP, i.UNIDADE_COMERCIAL,
                        i.QTDE_COMERCIAL, i.VALOR_UNITARIO, i.VALOR_TOTAL_ITEM,
                        i.CODPROD_WINTHOR, i.DESCRICAO_WINTHOR, i.UNIDADE_WINTHOR, i.NCM_WINTHOR,
                        i.STATUS_CADASTRO, i.STATUS_VALIDACAO, i.OBSERVACAO
                 FROM DFE_NFE_ITEM i WHERE i.ID_DFE = :id ORDER BY i.NUM_ITEM`,
                { id: idDfe }, { outFormat: 4002 }
            );
            return reply.send({ itens: res?.rows ?? [] });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // POST /api/fiscal/radar/produtos/buscar — busca produto WinThor
    app.post("/api/fiscal/radar/produtos/buscar", async (req, reply) => {
        const { ean, codProdFornecedor, cnpjFornecedor, texto } = req.body ?? {};
        if (texto) {
            const prods = await buscarProdutosPorDescricao(texto);
            return reply.send({ produtos: prods });
        }
        const resultado = await buscarProdutoWinthor({ ean, codProdFornecedor, cnpjFornecedor });
        return reply.send(resultado);
    });

    // POST /api/fiscal/radar/produtos/mapear — salva mapeamento fornecedor->winthor
    app.post("/api/fiscal/radar/produtos/mapear", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const { cnpjFornecedor, codProdFornecedor, ean, codprodWinthor, descricaoForn, unidadeForn, fatorConversao } = req.body ?? {};
        if (!cnpjFornecedor || !codProdFornecedor || !codprodWinthor) {
            return reply.status(400).send({ error: "cnpjFornecedor, codProdFornecedor e codprodWinthor são obrigatórios" });
        }
        const usuario = req.authUser?.matricula || req.authUser?.nome || "SISTEMA";
        try {
            await salvarMapeamentoProduto({ cnpjFornecedor, codProdFornecedor, ean, codprodWinthor, descricaoForn, unidadeForn, fatorConversao, usuario });

            // Atualiza item na NF-e se informado
            if (req.body.idItem) {
                await executeOracle(
                    `UPDATE DFE_NFE_ITEM SET CODPROD_WINTHOR = :cod, STATUS_CADASTRO = 'MAPEADO_MANUAL' WHERE ID_ITEM = :id`,
                    { cod: codprodWinthor, id: req.body.idItem }
                );
            }

            await gravarLog("FISCAL_RADAR", "MAPEAR_PRODUTO", cnpjFornecedor, null, null, usuario, "OK",
                `${codProdFornecedor} -> ${codprodWinthor}`, null);

            return reply.send({ ok: true });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // GET /api/fiscal/radar/logs — log de processo
    app.get("/api/fiscal/radar/logs", async (req, reply) => {
        if (!isOracleEnabled()) return reply.send({ logs: [] });
        const q = req.query;
        const lim = Math.min(200, parseInt(q.limite) || 50);
        const binds = {};
        const filtros = [];
        if (q.cnpjEmpresa) { filtros.push("l.CNPJ_EMPRESA = :cnpj"); binds.cnpj = q.cnpjEmpresa.replace(/\D/g, ""); }
        if (q.modulo)    { filtros.push("l.MODULO = :mod"); binds.mod = q.modulo; }
        if (q.status)    { filtros.push("l.STATUS = :st"); binds.st = q.status; }
        const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
        try {
            const res = await executeOracle(
                `SELECT l.ID_LOG, l.MODULO, l.ACAO, l.CNPJ_EMPRESA, l.CHAVE_NFE, l.NSU,
                        l.USUARIO, l.DATA_HORA, l.STATUS, l.MENSAGEM
                 FROM DFE_LOG_PROCESSO l ${where}
                 ORDER BY l.DATA_HORA DESC
                 FETCH FIRST :lim ROWS ONLY`,
                { ...binds, lim }, { outFormat: 4002 }
            );
            return reply.send({ logs: res?.rows ?? [] });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });

    // GET /api/fiscal/radar/dashboard — métricas rápidas
    app.get("/api/fiscal/radar/dashboard", async (req, reply) => {
        if (!isOracleEnabled()) return reply.send({ oracle: false });
        const cnpjEmpresa = req.query.cnpjEmpresa?.replace(/\D/g, "") || null;
        const binds = {};
        const wh = cnpjEmpresa ? "WHERE d.CNPJ_EMPRESA = :cnpj" : "";
        if (cnpjEmpresa) binds.cnpj = cnpjEmpresa;
        try {
            const [totRes, stEntRes, stManRes, itenRes] = await Promise.all([
                executeOracle(`SELECT COUNT(*) AS TOTAL, SUM(d.VALOR_TOTAL_NFE) AS VALOR FROM DFE_NFE_DOCUMENTO d ${wh}`, binds, { outFormat: 4002 }),
                executeOracle(`SELECT d.STATUS_ENTRADA, COUNT(*) AS QTD FROM DFE_NFE_DOCUMENTO d ${wh} GROUP BY d.STATUS_ENTRADA`, binds, { outFormat: 4002 }),
                executeOracle(`SELECT d.STATUS_MANIFESTACAO, COUNT(*) AS QTD FROM DFE_NFE_DOCUMENTO d ${wh} GROUP BY d.STATUS_MANIFESTACAO`, binds, { outFormat: 4002 }),
                executeOracle(`SELECT i.STATUS_CADASTRO, COUNT(*) AS QTD FROM DFE_NFE_ITEM i ${cnpjEmpresa ? "JOIN DFE_NFE_DOCUMENTO d ON d.ID_DFE = i.ID_DFE WHERE d.CNPJ_EMPRESA = :cnpj" : ""} GROUP BY i.STATUS_CADASTRO`, binds, { outFormat: 4002 }),
            ]);

            const byEntrada = Object.fromEntries((stEntRes?.rows ?? []).map(r => [r.STATUS_ENTRADA, r.QTD]));
            const byManifest = Object.fromEntries((stManRes?.rows ?? []).map(r => [r.STATUS_MANIFESTACAO, r.QTD]));
            const byItem = Object.fromEntries((itenRes?.rows ?? []).map(r => [r.STATUS_CADASTRO, r.QTD]));

            return reply.send({
                oracle: true,
                totalDocumentos: totRes?.rows?.[0]?.TOTAL ?? 0,
                valorTotal: totRes?.rows?.[0]?.VALOR ?? 0,
                porStatusEntrada: byEntrada,
                porStatusManifestacao: byManifest,
                porStatusItem: byItem,
            });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });
}

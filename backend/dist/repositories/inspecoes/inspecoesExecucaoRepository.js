import { db } from "../dataStore.js";
import { execDml, queryOne, queryRows } from "../baseRepository.js";
import { isOracleEnabled } from "../../db/oracle.js";
import { asNumber, ensureModeloNome, ensureSetorIdFromModelo, findSetorIdByNome, findSetorNomeById, getAuditTimestampColumns, normalizeStatusResultado, pickFirstExistingColumn, pickOptionalColumn, toIso, uid, } from "./shared.js";
let schemaPromise = null;
async function getExecSchema() {
    if (!schemaPromise) {
        schemaPromise = (async () => {
            const execAudit = await getAuditTimestampColumns("INS_EXECUCAO");
            const itemAudit = await getAuditTimestampColumns("INS_EXECUCAO_ITEM");
            const evidAudit = await getAuditTimestampColumns("INS_EXECUCAO_ITEM_EVIDENCIA");
            return {
                execCodigoColumn: await pickOptionalColumn("INS_EXECUCAO", ["CODIGO"]),
                execDateColumn: await pickFirstExistingColumn("INS_EXECUCAO", ["DATA_HORA", "DATA_INICIO"]),
                execStatusColumn: await pickFirstExistingColumn("INS_EXECUCAO", ["STATUS"]),
                execExecutorUsuarioIdColumn: await pickOptionalColumn("INS_EXECUCAO", ["EXECUTOR_USUARIO_ID"]),
                execExecutorNomeColumn: await pickFirstExistingColumn("INS_EXECUCAO", ["EXECUTOR_NOME", "INSPETOR"]),
                execTotalItensColumn: await pickOptionalColumn("INS_EXECUCAO", ["TOTAL_ITENS"]),
                execConformesColumn: await pickOptionalColumn("INS_EXECUCAO", ["CONFORMES"]),
                execNaoConformesColumn: await pickOptionalColumn("INS_EXECUCAO", ["NAO_CONFORMES"]),
                execNaoAplicaColumn: await pickOptionalColumn("INS_EXECUCAO", ["NAO_APLICA"]),
                execTaxaColumn: await pickOptionalColumn("INS_EXECUCAO", ["TAXA_CONFORMIDADE"]),
                execObservacaoColumn: await pickFirstExistingColumn("INS_EXECUCAO", ["OBSERVACAO_GERAL", "OBSERVACOES"]),
                execCreatedAtColumn: execAudit.createdAtColumn,
                execUpdatedAtColumn: execAudit.updatedAtColumn,
                itemModeloItemColumn: await pickFirstExistingColumn("INS_EXECUCAO_ITEM", ["MODELO_ITEM_ID", "ITEM_ID"]),
                itemCodigoItemColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["CODIGO_ITEM"]),
                itemOrdemColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["ORDEM"]),
                itemDescricaoColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["DESCRICAO", "ITEM", "DESCRICAO_ITEM"]),
                itemResultadoColumn: await pickFirstExistingColumn("INS_EXECUCAO_ITEM", ["RESULTADO", "STATUS"]),
                itemTipoNcIdColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["TIPO_NC_ID"]),
                itemTipoNcNomeColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["TIPO_NC_NOME"]),
                itemOutraNcColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["OUTRA_NC"]),
                itemObservacaoColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["OBSERVACAO"]),
                itemTimestampColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["TIMESTAMP_RESPOSTA", "DATA_HORA_RESPOSTA"]),
                itemUsuarioColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["USUARIO", "USUARIO_ID"]),
                itemNomeColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["NOME", "USUARIO_NOME"]),
                itemSetorColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["SETOR", "SETOR_NOME"]),
                itemFotoUrlColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM", ["FOTO_URL"]),
                itemCreatedAtColumn: itemAudit.createdAtColumn,
                itemUpdatedAtColumn: itemAudit.updatedAtColumn,
                evidExecItemColumn: await pickFirstExistingColumn("INS_EXECUCAO_ITEM_EVIDENCIA", ["EXECUCAO_ITEM_ID", "EXEC_ITEM_ID"]),
                evidOrdemColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM_EVIDENCIA", ["ORDEM_ARQUIVO"]),
                evidNomeColumn: await pickFirstExistingColumn("INS_EXECUCAO_ITEM_EVIDENCIA", ["NOME_ARQUIVO", "ARQUIVO_NOME"]),
                evidUrlColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM_EVIDENCIA", ["URL_ARQUIVO", "ARQUIVO_URL"]),
                evidReferenciaColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM_EVIDENCIA", ["REFERENCIA_ARQUIVO"]),
                evidMimeColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM_EVIDENCIA", ["MIME_TYPE", "TIPO_MIME"]),
                evidTamanhoColumn: await pickOptionalColumn("INS_EXECUCAO_ITEM_EVIDENCIA", ["TAMANHO_ARQUIVO"]),
                evidCreatedAtColumn: evidAudit.createdAtColumn,
                modelItemCodigoColumn: await pickOptionalColumn("INS_MODELO_CHECKLIST_ITEM", ["CODIGO_ITEM"]),
                modelItemOrdemColumn: await pickOptionalColumn("INS_MODELO_CHECKLIST_ITEM", ["ORDEM"]),
                modelItemDescricaoColumn: await pickFirstExistingColumn("INS_MODELO_CHECKLIST_ITEM", ["DESCRICAO"]),
            };
        })();
    }
    return schemaPromise;
}
function columnOrNull(columnName, alias) {
    return columnName ? `${columnName} AS ${alias}` : `NULL AS ${alias}`;
}
function pushColumnBinding(columns, values, binds, column, bindKey, bindValue) {
    if (!column)
        return;
    columns.push(column);
    values.push(`:${bindKey}`);
    binds[bindKey] = bindValue;
}
async function loadExecItems(execucaoId) {
    const schema = await getExecSchema();
    const orderByItems = schema.itemOrdemColumn ? `${schema.itemOrdemColumn}, ID` : "ID";
    const itemRows = await queryRows(`SELECT ID,
            ${schema.itemModeloItemColumn} AS MODELO_ITEM_ID,
            ${columnOrNull(schema.itemCodigoItemColumn, "CODIGO_ITEM")},
            ${columnOrNull(schema.itemOrdemColumn, "ORDEM")},
            ${columnOrNull(schema.itemDescricaoColumn, "DESCRICAO")},
            ${schema.itemResultadoColumn} AS RESULTADO,
            ${columnOrNull(schema.itemTipoNcIdColumn, "TIPO_NC_ID")},
            ${columnOrNull(schema.itemTipoNcNomeColumn, "TIPO_NC_NOME")},
            ${columnOrNull(schema.itemOutraNcColumn, "OUTRA_NC")},
            ${columnOrNull(schema.itemObservacaoColumn, "OBSERVACAO")},
            ${columnOrNull(schema.itemTimestampColumn, "TIMESTAMP_RESPOSTA")},
            ${columnOrNull(schema.itemUsuarioColumn, "USUARIO")},
            ${columnOrNull(schema.itemNomeColumn, "NOME")},
            ${columnOrNull(schema.itemSetorColumn, "SETOR")},
            ${columnOrNull(schema.itemFotoUrlColumn, "FOTO_URL")}
       FROM INS_EXECUCAO_ITEM
      WHERE EXECUCAO_ID = :execucaoId
      ORDER BY ${orderByItems}`, { execucaoId });
    const mapped = [];
    const orderByEvid = schema.evidOrdemColumn ? `${schema.evidOrdemColumn}, ID` : "ID";
    for (const row of itemRows) {
        const evidRows = await queryRows(`SELECT ID,
              ${schema.evidOrdemColumn ? `${schema.evidOrdemColumn} AS ORDEM_ARQUIVO` : "ROW_NUMBER() OVER (ORDER BY ID) AS ORDEM_ARQUIVO"},
              ${schema.evidNomeColumn} AS NOME_ARQUIVO,
              ${columnOrNull(schema.evidUrlColumn, "URL_ARQUIVO")},
              ${columnOrNull(schema.evidReferenciaColumn, "REFERENCIA_ARQUIVO")}
         FROM INS_EXECUCAO_ITEM_EVIDENCIA
        WHERE ${schema.evidExecItemColumn} = :itemId
        ORDER BY ${orderByEvid}`, { itemId: row.ID });
        const evidencias = evidRows
            .map((ev) => ev.NOME_ARQUIVO || ev.REFERENCIA_ARQUIVO || ev.URL_ARQUIVO || "")
            .filter(Boolean)
            .slice(0, 3);
        const primeiraEvidencia = evidRows[0]?.URL_ARQUIVO ?? evidRows[0]?.REFERENCIA_ARQUIVO ?? evidRows[0]?.NOME_ARQUIVO ?? undefined;
        const status = normalizeStatusResultado(row.RESULTADO);
        mapped.push({
            id: row.ID,
            itemModeloId: row.MODELO_ITEM_ID,
            codigoItem: row.CODIGO_ITEM ?? undefined,
            item: row.CODIGO_ITEM ?? undefined,
            descricao: row.DESCRICAO ?? row.CODIGO_ITEM ?? "Item de checklist",
            ordem: asNumber(row.ORDEM, 0),
            resultado: status,
            status,
            timestampResposta: row.TIMESTAMP_RESPOSTA ? toIso(row.TIMESTAMP_RESPOSTA) : undefined,
            usuario: row.USUARIO ?? undefined,
            nome: row.NOME ?? undefined,
            setor: row.SETOR ?? undefined,
            tipoNcId: row.TIPO_NC_ID ?? undefined,
            tipoNcNome: row.TIPO_NC_NOME ?? undefined,
            outraNc: row.OUTRA_NC ?? undefined,
            observacao: row.OBSERVACAO ?? undefined,
            observacaoItem: row.OBSERVACAO ?? undefined,
            fotoUrl: row.FOTO_URL ?? primeiraEvidencia,
            evidencias: evidencias.length > 0 ? evidencias : undefined,
            evidenciaNomeArquivo: evidencias.length > 0 ? evidencias[0] : undefined,
            evidenciaUrl: evidRows[0]?.URL_ARQUIVO ?? row.FOTO_URL ?? undefined,
        });
    }
    return mapped;
}
function mapFallbackExec(item) {
    return {
        id: item.id,
        modeloId: item.modeloId,
        modeloNome: item.modeloNome ?? "",
        setor: item.setor,
        executorUsuarioId: item.executorUsuarioId ?? item.usuarioId,
        executor: item.executor ?? item.inspetor ?? "",
        dataHora: item.dataHora ?? item.dataInicio ?? new Date().toISOString(),
        status: item.status ?? "CONCLUIDA",
        totalItens: asNumber(item.totalItens, item.itens?.length ?? 0),
        conformes: asNumber(item.conformes, 0),
        naoConformes: asNumber(item.naoConformes, 0),
        naoAplica: asNumber(item.naoAplica, 0),
        taxaConformidade: asNumber(item.taxaConformidade, 0),
        observacaoGeral: item.observacaoGeral ?? item.observacoes,
        itens: Array.isArray(item.itens)
            ? item.itens.map((sub, idx) => ({
                id: sub.id,
                itemModeloId: sub.itemModeloId ?? sub.itemId,
                codigoItem: sub.codigoItem ?? sub.item ?? sub.itemModeloId,
                item: sub.item ?? sub.codigoItem ?? sub.itemModeloId,
                descricao: sub.descricao,
                ordem: asNumber(sub.ordem, idx + 1),
                resultado: normalizeStatusResultado(sub.resultado ?? sub.status),
                status: normalizeStatusResultado(sub.resultado ?? sub.status),
                timestampResposta: sub.timestampResposta ?? sub.timestamp ?? item.dataHora ?? new Date().toISOString(),
                usuario: sub.usuario ?? item.executorUsuarioId,
                nome: sub.nome ?? item.executor ?? item.inspetor ?? "",
                setor: sub.setor ?? item.setor,
                tipoNcId: sub.tipoNcId,
                tipoNcNome: sub.tipoNcNome,
                observacao: sub.observacao ?? sub.observacaoItem,
                observacaoItem: sub.observacaoItem ?? sub.observacao,
                fotoUrl: sub.fotoUrl ?? sub.evidenciaUrl ?? (Array.isArray(sub.evidencias) ? sub.evidencias[0] : undefined),
                evidencias: sub.evidencias,
                evidenciaNomeArquivo: sub.evidenciaNomeArquivo,
                evidenciaUrl: sub.evidenciaUrl ?? sub.fotoUrl,
            }))
            : [],
    };
}
async function loadExecRowById(id) {
    const schema = await getExecSchema();
    const row = await queryOne(`SELECT e.ID,
            ${schema.execCodigoColumn ? `e.${schema.execCodigoColumn}` : "e.ID"} AS CODIGO,
            e.MODELO_ID,
            m.NOME AS MODELO_NOME,
            e.SETOR_ID,
            s.NOME AS SETOR_NOME,
            ${columnOrNull(schema.execExecutorUsuarioIdColumn, "EXECUTOR_USUARIO_ID")},
            e.${schema.execExecutorNomeColumn} AS EXECUTOR_NOME,
            TO_CHAR(e.${schema.execDateColumn}, 'YYYY-MM-DD"T"HH24:MI:SS') AS DATA_HORA,
            e.${schema.execStatusColumn} AS STATUS,
            ${schema.execTotalItensColumn ? `e.${schema.execTotalItensColumn}` : "0"} AS TOTAL_ITENS,
            ${schema.execConformesColumn ? `e.${schema.execConformesColumn}` : "0"} AS CONFORMES,
            ${schema.execNaoConformesColumn ? `e.${schema.execNaoConformesColumn}` : "0"} AS NAO_CONFORMES,
            ${schema.execNaoAplicaColumn ? `e.${schema.execNaoAplicaColumn}` : "0"} AS NAO_APLICA,
            ${schema.execTaxaColumn ? `e.${schema.execTaxaColumn}` : "0"} AS TAXA_CONFORMIDADE,
            e.${schema.execObservacaoColumn} AS OBSERVACAO_GERAL
       FROM INS_EXECUCAO e
       JOIN INS_MODELO_CHECKLIST m ON m.ID = e.MODELO_ID
       JOIN INS_SETOR s ON s.ID = e.SETOR_ID
      WHERE e.ID = :id`, { id });
    if (!row)
        return null;
    const dataHora = toIso(row.DATA_HORA);
    const itensCarregados = await loadExecItems(row.ID);
    const itens = itensCarregados.map((item) => ({
        ...item,
        timestampResposta: item.timestampResposta ?? dataHora,
        usuario: item.usuario ?? row.EXECUTOR_USUARIO_ID ?? row.EXECUTOR_NOME ?? undefined,
        nome: item.nome ?? row.EXECUTOR_NOME ?? "",
        setor: item.setor ?? row.SETOR_NOME,
    }));
    return {
        id: row.ID,
        modeloId: row.MODELO_ID,
        modeloNome: row.MODELO_NOME,
        setor: row.SETOR_NOME,
        executorUsuarioId: row.EXECUTOR_USUARIO_ID ?? undefined,
        executor: row.EXECUTOR_NOME ?? "",
        dataHora,
        status: row.STATUS,
        totalItens: asNumber(row.TOTAL_ITENS, itens.length),
        conformes: asNumber(row.CONFORMES, 0),
        naoConformes: asNumber(row.NAO_CONFORMES, 0),
        naoAplica: asNumber(row.NAO_APLICA, 0),
        taxaConformidade: asNumber(row.TAXA_CONFORMIDADE, 0),
        observacaoGeral: row.OBSERVACAO_GERAL ?? undefined,
        itens,
    };
}
export async function listExecucoes() {
    if (!isOracleEnabled()) {
        return db.inspecoesExecucoes.map((item) => mapFallbackExec(item));
    }
    const schema = await getExecSchema();
    const rows = await queryRows(`SELECT ID
       FROM INS_EXECUCAO
      ORDER BY ${schema.execDateColumn} DESC, ID DESC`);
    const output = [];
    for (const row of rows) {
        const loaded = await loadExecRowById(row.ID);
        if (loaded)
            output.push(loaded);
    }
    return output;
}
export async function getExecucaoById(id) {
    if (!isOracleEnabled()) {
        const found = db.inspecoesExecucoes.find((item) => item.id === id);
        return found ? mapFallbackExec(found) : null;
    }
    return loadExecRowById(id);
}
async function resolveExecContext(data) {
    const modeloId = data.modeloId;
    if (!modeloId)
        throw new Error("modeloId obrigatorio para criar execucao");
    const fallbackSetorId = await ensureSetorIdFromModelo(modeloId);
    const fallbackSetorNome = fallbackSetorId ? await findSetorNomeById(fallbackSetorId) : null;
    let setorId = data.setor ? await findSetorIdByNome(data.setor) : null;
    if (!setorId)
        setorId = fallbackSetorId;
    if (!setorId)
        throw new Error(`Setor nao encontrado para modelo ${modeloId}`);
    const setorNome = data.setor ?? fallbackSetorNome ?? "";
    const modeloNome = data.modeloNome ?? (await ensureModeloNome(modeloId)) ?? "";
    return { setorId, setorNome, modeloNome };
}
async function lookupModelItem(modeloItemId) {
    const schema = await getExecSchema();
    const row = await queryOne(`SELECT ${columnOrNull(schema.modelItemCodigoColumn, "CODIGO_ITEM")},
            ${columnOrNull(schema.modelItemOrdemColumn, "ORDEM")},
            ${schema.modelItemDescricaoColumn} AS DESCRICAO
       FROM INS_MODELO_CHECKLIST_ITEM
      WHERE ID = :id`, { id: modeloItemId });
    if (!row)
        return null;
    return {
        codigoItem: row.CODIGO_ITEM ?? modeloItemId,
        ordem: asNumber(row.ORDEM, 0),
        descricao: row.DESCRICAO,
    };
}
export async function createExecucao(data) {
    const id = data.id ?? uid("EXEC");
    if (!isOracleEnabled()) {
        const mapped = mapFallbackExec({ ...data, id });
        const idx = db.inspecoesExecucoes.findIndex((item) => item.id === id);
        if (idx >= 0)
            db.inspecoesExecucoes[idx] = mapped;
        else
            db.inspecoesExecucoes.push(mapped);
        return mapped;
    }
    const schema = await getExecSchema();
    const { setorId, modeloNome } = await resolveExecContext(data);
    const itens = Array.isArray(data.itens) ? data.itens : [];
    const conformes = data.conformes ?? itens.filter((item) => normalizeStatusResultado(item.resultado) === "CONFORME").length;
    const naoConformes = data.naoConformes ?? itens.filter((item) => normalizeStatusResultado(item.resultado) === "NAO_CONFORME").length;
    const naoAplica = data.naoAplica ?? itens.filter((item) => normalizeStatusResultado(item.resultado) === "NAO_APLICA").length;
    const totalItens = data.totalItens ?? itens.length;
    const avaliaveis = conformes + naoConformes;
    const taxaConformidade = data.taxaConformidade ?? (avaliaveis > 0 ? (conformes / avaliaveis) * 100 : 100);
    const codigo = data.codigo ?? id;
    const dataHora = new Date(data.dataHora ?? new Date().toISOString());
    const status = data.status ?? "CONCLUIDA";
    const observacaoGeral = data.observacaoGeral ?? null;
    const executorNome = data.executor ?? "";
    const executorUsuarioId = data.executorUsuarioId ?? null;
    const existsRow = await queryOne(`SELECT COUNT(*) AS CNT FROM INS_EXECUCAO WHERE ID = :id`, { id });
    const exists = asNumber(existsRow?.CNT, 0) > 0;
    if (exists) {
        const updateBinds = {
            id,
            modeloId: data.modeloId,
            setorId,
            status,
            dataHora,
        };
        const updateClauses = ["MODELO_ID = :modeloId", "SETOR_ID = :setorId", `${schema.execStatusColumn} = :status`];
        if (schema.execCodigoColumn) {
            updateClauses.push(`${schema.execCodigoColumn} = :codigo`);
            updateBinds.codigo = codigo;
        }
        if (schema.execExecutorUsuarioIdColumn) {
            updateClauses.push(`${schema.execExecutorUsuarioIdColumn} = :executorUsuarioId`);
            updateBinds.executorUsuarioId = executorUsuarioId;
        }
        updateClauses.push(`${schema.execExecutorNomeColumn} = :executorNome`);
        updateBinds.executorNome = executorNome;
        updateClauses.push(`${schema.execDateColumn} = :dataHora`);
        if (schema.execTotalItensColumn) {
            updateClauses.push(`${schema.execTotalItensColumn} = :totalItens`);
            updateBinds.totalItens = totalItens;
        }
        if (schema.execConformesColumn) {
            updateClauses.push(`${schema.execConformesColumn} = :conformes`);
            updateBinds.conformes = conformes;
        }
        if (schema.execNaoConformesColumn) {
            updateClauses.push(`${schema.execNaoConformesColumn} = :naoConformes`);
            updateBinds.naoConformes = naoConformes;
        }
        if (schema.execNaoAplicaColumn) {
            updateClauses.push(`${schema.execNaoAplicaColumn} = :naoAplica`);
            updateBinds.naoAplica = naoAplica;
        }
        if (schema.execTaxaColumn) {
            updateClauses.push(`${schema.execTaxaColumn} = :taxaConformidade`);
            updateBinds.taxaConformidade = taxaConformidade;
        }
        updateClauses.push(`${schema.execObservacaoColumn} = :observacaoGeral`);
        updateBinds.observacaoGeral = observacaoGeral;
        if (schema.execUpdatedAtColumn) {
            updateClauses.push(`${schema.execUpdatedAtColumn} = SYSTIMESTAMP`);
        }
        await execDml(`UPDATE INS_EXECUCAO SET ${updateClauses.join(", ")} WHERE ID = :id`, updateBinds);
    }
    else {
        const insertColumns = ["ID", "MODELO_ID", "SETOR_ID", schema.execStatusColumn];
        const insertValues = [":id", ":modeloId", ":setorId", ":status"];
        const insertBinds = {
            id,
            modeloId: data.modeloId,
            setorId,
            status,
        };
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execCodigoColumn, "codigo", codigo);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execExecutorUsuarioIdColumn, "executorUsuarioId", executorUsuarioId);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execExecutorNomeColumn, "executorNome", executorNome);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execDateColumn, "dataHora", dataHora);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execTotalItensColumn, "totalItens", totalItens);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execConformesColumn, "conformes", conformes);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execNaoConformesColumn, "naoConformes", naoConformes);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execNaoAplicaColumn, "naoAplica", naoAplica);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execTaxaColumn, "taxaConformidade", taxaConformidade);
        pushColumnBinding(insertColumns, insertValues, insertBinds, schema.execObservacaoColumn, "observacaoGeral", observacaoGeral);
        if (schema.execCreatedAtColumn) {
            insertColumns.push(schema.execCreatedAtColumn);
            insertValues.push("SYSTIMESTAMP");
        }
        if (schema.execUpdatedAtColumn) {
            insertColumns.push(schema.execUpdatedAtColumn);
            insertValues.push("SYSTIMESTAMP");
        }
        await execDml(`INSERT INTO INS_EXECUCAO (${insertColumns.join(", ")})
       VALUES (${insertValues.join(", ")})`, insertBinds);
    }
    await execDml(`DELETE FROM INS_EXECUCAO_ITEM_EVIDENCIA
      WHERE ${schema.evidExecItemColumn} IN (
        SELECT ID FROM INS_EXECUCAO_ITEM WHERE EXECUCAO_ID = :execucaoId
      )`, { execucaoId: id });
    await execDml(`DELETE FROM INS_EXECUCAO_ITEM WHERE EXECUCAO_ID = :execucaoId`, { execucaoId: id });
    for (const [idx, item] of itens.entries()) {
        const itemId = item.id ?? uid("EI");
        const modeloItemId = item.itemModeloId ?? item.modeloItemId;
        if (!modeloItemId) {
            throw new Error(`Item de execucao sem itemModeloId na posicao ${idx + 1}`);
        }
        const modelItem = await lookupModelItem(modeloItemId);
        const codigoItem = item.codigoItem ?? modelItem?.codigoItem ?? modeloItemId;
        const ordem = asNumber(item.ordem, modelItem?.ordem ?? idx + 1);
        const descricao = item.descricao ?? modelItem?.descricao ?? "Item de checklist";
        const resultado = normalizeStatusResultado(item.resultado);
        const observacao = item.observacaoItem ?? item.observacao ?? null;
        const timestampResposta = item.timestampResposta
            ? new Date(item.timestampResposta)
            : dataHora;
        const usuario = item.usuario ?? executorUsuarioId;
        const nome = item.nome ?? executorNome ?? null;
        const setor = item.setor ?? data.setor ?? null;
        const fotoUrl = item.fotoUrl ??
            item.evidenciaUrl ??
            (Array.isArray(item.evidencias) && item.evidencias.length > 0 ? String(item.evidencias[0]) : null);
        const itemColumns = ["ID", "EXECUCAO_ID", schema.itemModeloItemColumn, schema.itemResultadoColumn];
        const itemValues = [":id", ":execucaoId", ":modeloItemId", ":resultado"];
        const itemBinds = {
            id: itemId,
            execucaoId: id,
            modeloItemId,
            resultado,
        };
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemDescricaoColumn, "descricao", descricao);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemCodigoItemColumn, "codigoItem", codigoItem);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemOrdemColumn, "ordem", ordem);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemTipoNcIdColumn, "tipoNcId", item.tipoNcId ?? null);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemTipoNcNomeColumn, "tipoNcNome", item.tipoNcNome ?? null);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemOutraNcColumn, "outraNc", item.outraNc ?? null);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemObservacaoColumn, "observacao", observacao);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemTimestampColumn, "timestampResposta", timestampResposta);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemUsuarioColumn, "usuario", usuario);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemNomeColumn, "nome", nome);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemSetorColumn, "setor", setor);
        pushColumnBinding(itemColumns, itemValues, itemBinds, schema.itemFotoUrlColumn, "fotoUrl", fotoUrl);
        if (schema.itemCreatedAtColumn) {
            itemColumns.push(schema.itemCreatedAtColumn);
            itemValues.push("SYSTIMESTAMP");
        }
        if (schema.itemUpdatedAtColumn) {
            itemColumns.push(schema.itemUpdatedAtColumn);
            itemValues.push("SYSTIMESTAMP");
        }
        await execDml(`INSERT INTO INS_EXECUCAO_ITEM (${itemColumns.join(", ")})
       VALUES (${itemValues.join(", ")})`, itemBinds);
        const evidenceNames = Array.isArray(item.evidencias)
            ? item.evidencias.filter((ev) => typeof ev === "string" && ev.trim().length > 0)
            : item.evidenciaNomeArquivo
                ? [String(item.evidenciaNomeArquivo)]
                : item.fotoUrl
                    ? [String(item.fotoUrl)]
                    : [];
        for (const [evidenceIndex, evidenceName] of evidenceNames.slice(0, 3).entries()) {
            const evidColumns = ["ID", schema.evidExecItemColumn, schema.evidNomeColumn];
            const evidValues = [":id", ":execucaoItemId", ":nomeArquivo"];
            const evidBinds = {
                id: uid("EV"),
                execucaoItemId: itemId,
                nomeArquivo: evidenceName,
            };
            pushColumnBinding(evidColumns, evidValues, evidBinds, schema.evidOrdemColumn, "ordemArquivo", evidenceIndex + 1);
            pushColumnBinding(evidColumns, evidValues, evidBinds, schema.evidUrlColumn, "urlArquivo", evidenceIndex === 0 ? item.evidenciaUrl ?? fotoUrl ?? null : null);
            pushColumnBinding(evidColumns, evidValues, evidBinds, schema.evidReferenciaColumn, "referenciaArquivo", evidenceName);
            pushColumnBinding(evidColumns, evidValues, evidBinds, schema.evidMimeColumn, "mimeType", null);
            pushColumnBinding(evidColumns, evidValues, evidBinds, schema.evidTamanhoColumn, "tamanhoArquivo", null);
            if (schema.evidCreatedAtColumn) {
                evidColumns.push(schema.evidCreatedAtColumn);
                evidValues.push("SYSTIMESTAMP");
            }
            await execDml(`INSERT INTO INS_EXECUCAO_ITEM_EVIDENCIA (${evidColumns.join(", ")})
         VALUES (${evidValues.join(", ")})`, evidBinds);
        }
    }
    const created = await getExecucaoById(id);
    if (!created) {
        throw new Error("Falha ao carregar execucao criada");
    }
    return {
        ...created,
        modeloNome: created.modeloNome || modeloNome,
    };
}

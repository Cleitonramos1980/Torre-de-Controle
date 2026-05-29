import { db } from "../dataStore.js";
import { execDml, queryRows } from "../baseRepository.js";
import { isOracleEnabled } from "../../db/oracle.js";
import { findSetorIdByNome, getAuditTimestampColumns, pickFirstExistingColumn, pickOptionalColumn, uid } from "./shared.js";
let schemaPromise = null;
async function getSetorSchema() {
    if (!schemaPromise) {
        schemaPromise = (async () => {
            const audit = await getAuditTimestampColumns("INS_USUARIO_SETOR");
            return {
                userIdColumn: await pickFirstExistingColumn("INS_USUARIO_SETOR", ["USUARIO_ID", "USER_ID"]),
                ativoColumn: await pickOptionalColumn("INS_USUARIO_SETOR", ["ATIVO"]),
                createdAtColumn: audit.createdAtColumn,
                updatedAtColumn: audit.updatedAtColumn,
            };
        })();
    }
    return schemaPromise;
}
export async function listSetores() {
    if (!isOracleEnabled()) {
        const seen = new Set();
        for (const model of db.inspecoesModelos) {
            if (model.setor)
                seen.add(model.setor);
        }
        return Array.from(seen).sort();
    }
    const rows = await queryRows(`SELECT NOME
       FROM INS_SETOR
      WHERE ATIVO = 1
      ORDER BY ORDEM, NOME`);
    return rows.map((row) => row.NOME);
}
export async function listUsuarioSetor() {
    if (!isOracleEnabled()) {
        return db.inspecoesUsuarioSetor.map((item) => ({
            id: item.id,
            userId: item.userId,
            setor: item.setor,
            ativo: item.ativo !== false,
        }));
    }
    const schema = await getSetorSchema();
    const rows = await queryRows(`SELECT us.ID,
            us.${schema.userIdColumn} AS USUARIO_ID,
            s.NOME AS SETOR,
            ${schema.ativoColumn ? `us.${schema.ativoColumn}` : "1"} AS ATIVO
       FROM INS_USUARIO_SETOR us
       JOIN INS_SETOR s ON s.ID = us.SETOR_ID
      ORDER BY us.${schema.userIdColumn}, s.ORDEM, s.NOME`);
    return rows.map((row) => ({
        id: row.ID,
        userId: row.USUARIO_ID,
        setor: row.SETOR,
        ativo: row.ATIVO === 1,
    }));
}
export async function getSetoresByUserId(userId, perfil) {
    const perfilNormalizado = (perfil || "").trim().toUpperCase();
    if (perfilNormalizado === "ADMIN" || perfilNormalizado === "DIRETORIA") {
        return listSetores();
    }
    if (!isOracleEnabled()) {
        return db.inspecoesUsuarioSetor
            .filter((item) => item.userId === userId && item.ativo !== false)
            .map((item) => item.setor);
    }
    const schema = await getSetorSchema();
    const ativoWhere = schema.ativoColumn ? `AND us.${schema.ativoColumn} = 1` : "";
    const rows = await queryRows(`SELECT s.NOME
       FROM INS_USUARIO_SETOR us
       JOIN INS_SETOR s ON s.ID = us.SETOR_ID
      WHERE us.${schema.userIdColumn} = :userId
        ${ativoWhere}
        AND s.ATIVO = 1
      ORDER BY s.ORDEM, s.NOME`, { userId });
    return rows.map((row) => row.NOME);
}
export async function addUsuarioSetor(data) {
    const id = data.id ?? uid("US");
    const ativo = data.ativo !== false;
    if (!isOracleEnabled()) {
        const payload = { id, userId: data.userId, setor: data.setor, ativo };
        const idx = db.inspecoesUsuarioSetor.findIndex((item) => item.id === id);
        if (idx >= 0)
            db.inspecoesUsuarioSetor[idx] = payload;
        else
            db.inspecoesUsuarioSetor.push(payload);
        return payload;
    }
    const setorId = await findSetorIdByNome(data.setor);
    if (!setorId) {
        throw new Error(`Setor nao encontrado: ${data.setor}`);
    }
    const schema = await getSetorSchema();
    const updateClauses = [
        `t.${schema.userIdColumn} = s.${schema.userIdColumn}`,
        "t.SETOR_ID = s.SETOR_ID",
    ];
    if (schema.ativoColumn) {
        updateClauses.push(`t.${schema.ativoColumn} = s.${schema.ativoColumn}`);
    }
    if (schema.updatedAtColumn) {
        updateClauses.push(`t.${schema.updatedAtColumn} = SYSTIMESTAMP`);
    }
    const insertColumns = ["ID", schema.userIdColumn, "SETOR_ID"];
    const insertValues = [`s.ID`, `s.${schema.userIdColumn}`, "s.SETOR_ID"];
    if (schema.ativoColumn) {
        insertColumns.push(schema.ativoColumn);
        insertValues.push(`s.${schema.ativoColumn}`);
    }
    if (schema.createdAtColumn) {
        insertColumns.push(schema.createdAtColumn);
        insertValues.push("SYSTIMESTAMP");
    }
    if (schema.updatedAtColumn) {
        insertColumns.push(schema.updatedAtColumn);
        insertValues.push("SYSTIMESTAMP");
    }
    const sourceSelect = schema.ativoColumn
        ? `SELECT :id ID, :userId ${schema.userIdColumn}, :setorId SETOR_ID, :ativo ${schema.ativoColumn} FROM dual`
        : `SELECT :id ID, :userId ${schema.userIdColumn}, :setorId SETOR_ID FROM dual`;
    const binds = {
        id,
        userId: data.userId,
        setorId,
    };
    if (schema.ativoColumn) {
        binds.ativo = ativo ? 1 : 0;
    }
    await execDml(`MERGE INTO INS_USUARIO_SETOR t
     USING (${sourceSelect}) s
        ON (t.ID = s.ID)
      WHEN MATCHED THEN UPDATE SET
        ${updateClauses.join(", ")}
      WHEN NOT MATCHED THEN INSERT (
        ${insertColumns.join(", ")}
      ) VALUES (
        ${insertValues.join(", ")}
      )`, binds);
    return { id, userId: data.userId, setor: data.setor, ativo };
}
export async function removeUsuarioSetor(id) {
    if (!isOracleEnabled()) {
        const idx = db.inspecoesUsuarioSetor.findIndex((item) => item.id === id);
        if (idx < 0)
            return false;
        db.inspecoesUsuarioSetor.splice(idx, 1);
        return true;
    }
    await execDml(`DELETE FROM INS_USUARIO_SETOR WHERE ID = :id`, { id });
    return true;
}

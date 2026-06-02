import fs from "node:fs";
import path from "node:path";
import { createRequire as _cjsRequire } from "node:module";
const _xlsxLib = _cjsRequire(import.meta.url)("xlsx");
const xlsxWrite = _xlsxLib.write;
import { baixarRelatorioRede, listarRelatorios, caminhoRelatorio } from "../services/redePortalScraper.js";
import { converterRedeParaSitef4 } from "../services/redeToSitef4.js";
import { converterRedeParaSitef36 } from "../services/redeToSitef36.js";

let syncEmAndamento = false;

export async function redeRelatorioRoutes(app) {

    // GET /api/rede-relatorio/arquivos — lista relatórios baixados
    app.get("/api/rede-relatorio/arquivos", async (req, reply) => {
        const lista = listarRelatorios();
        return { data: lista, total: lista.length, syncEmAndamento };
    });

    // POST /api/rede-relatorio/sync — dispara download manual
    app.post("/api/rede-relatorio/sync", async (req, reply) => {
        if (syncEmAndamento) {
            return reply.code(409).send({ error: { message: "Download já em andamento. Aguarde." } });
        }
        syncEmAndamento = true;
        reply.code(202).send({ ok: true, message: "Download iniciado em segundo plano." });

        // roda em background sem travar o request
        baixarRelatorioRede(app.log)
            .then(r => app.log.info(r, "redeRelatorio: download manual concluído"))
            .catch(e => app.log.error({ err: e }, "redeRelatorio: download manual falhou"))
            .finally(() => { syncEmAndamento = false; });
    });

    // GET /api/rede-relatorio/download/:nome — serve o arquivo
    app.get("/api/rede-relatorio/download/:nome", async (req, reply) => {
        const fp = caminhoRelatorio(req.params.nome);
        if (!fp) return reply.code(404).send({ error: { message: "Arquivo não encontrado." } });

        const stat = fs.statSync(fp);
        const ext  = path.extname(fp).toLowerCase();
        const mime = ext === ".xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : ext === ".xls"
            ? "application/vnd.ms-excel"
            : "text/csv";

        reply.header("Content-Type", mime);
        reply.header("Content-Disposition", `attachment; filename="${path.basename(fp)}"`);
        reply.header("Content-Length", stat.size);
        return reply.send(fs.createReadStream(fp));
    });

    // GET /api/rede-relatorio/converter-sitef4/:nome — converte Excel Rede → SiTef Layout 4.1
    app.get("/api/rede-relatorio/converter-sitef4/:nome", async (req, reply) => {
        const fp = caminhoRelatorio(req.params.nome);
        if (!fp) return reply.code(404).send({ error: { message: "Arquivo não encontrado." } });

        let resultado;
        try {
            resultado = converterRedeParaSitef4(fp);
        } catch (err) {
            app.log.error({ err }, "redeRelatorio: erro na conversão SiTef 4.1");
            return reply.code(500).send({ error: { message: `Erro na conversão: ${err.message}` } });
        }

        const { wb, periodStart, periodEnd } = resultado;
        const nomeBase = path.basename(fp, path.extname(fp));
        const nomeOut  = `conversao_rede_para_sitef_layout_4_1_${nomeBase}.xlsx`;

        const buf = xlsxWrite(wb, { type: "buffer", bookType: "xlsx" });

        reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        reply.header("Content-Disposition", `attachment; filename="${nomeOut}"`);
        reply.header("Content-Length", buf.length);
        return reply.send(buf);
    });

    // GET /api/rede-relatorio/converter-sitef36/:nome — converte Excel Rede → SiTef Layout 3.6 (CSV)
    app.get("/api/rede-relatorio/converter-sitef36/:nome", async (req, reply) => {
        const fp = caminhoRelatorio(req.params.nome);
        if (!fp) return reply.code(404).send({ error: { message: "Arquivo não encontrado." } });

        let resultado;
        try {
            resultado = converterRedeParaSitef36(fp);
        } catch (err) {
            app.log.error({ err }, "redeRelatorio: erro na conversão SiTef 3.6");
            return reply.code(500).send({ error: { message: `Erro na conversão: ${err.message}` } });
        }

        const { csv } = resultado;
        const nomeBase = path.basename(fp, path.extname(fp));
        const nomeOut  = `EEXTRATO_${nomeBase}.csv`;

        const buf = Buffer.from(csv, "utf-8");

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="${nomeOut}"`);
        reply.header("Content-Length", buf.length);
        return reply.send(buf);
    });

    // GET /api/rede-relatorio/status — status do agendador
    app.get("/api/rede-relatorio/status", async (req, reply) => {
        const lista = listarRelatorios();
        const ultimo = lista[0] || null;
        return {
            agendamento: `diário às ${process.env.REDE_PORTAL_CRON_HORA || "6"}h`,
            syncEmAndamento,
            ultimoArquivo: ultimo,
        };
    });
}

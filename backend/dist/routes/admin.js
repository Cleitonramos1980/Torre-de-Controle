import { z } from "zod";
import { adminRepo } from "../repositories/sgqRepository.js";
import { hashPassword } from "../utils/password.js";
function sanitizeUsuario(usuario) {
    const { senhaHash: _senhaHash, ...safeUser } = (usuario ?? {});
    return safeUser;
}
export async function adminRoutes(app) {
    app.get("/api/admin/usuarios", async () => adminRepo.getUsuarios().map(sanitizeUsuario));
    app.post("/api/admin/usuarios", async (req) => {
        const body = z.object({
            nome: z.string(),
            email: z.string().email(),
            perfil: z.string(),
            ativo: z.boolean().default(true),
            senha: z.string().min(1).optional(),
        }).parse(req.body);
        const payload = {
            nome: body.nome,
            email: body.email,
            perfil: body.perfil,
            ativo: body.ativo,
            ...(body.senha ? { senhaHash: hashPassword(body.senha) } : {}),
        };
        const created = adminRepo.createUsuario(payload);
        return sanitizeUsuario(created);
    });
    app.put("/api/admin/usuarios/:id", async (req) => {
        const params = z.object({ id: z.string() }).parse(req.params);
        const body = z.object({
            nome: z.string().optional(),
            email: z.string().email().optional(),
            perfil: z.string().optional(),
            ativo: z.boolean().optional(),
            senha: z.string().min(1).optional(),
        }).parse(req.body);
        const payload = {
            ...(body.nome !== undefined ? { nome: body.nome } : {}),
            ...(body.email !== undefined ? { email: body.email } : {}),
            ...(body.perfil !== undefined ? { perfil: body.perfil } : {}),
            ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
            ...(body.senha !== undefined ? { senhaHash: hashPassword(body.senha) } : {}),
        };
        const updated = adminRepo.updateUsuario(params.id, payload);
        return updated ? sanitizeUsuario(updated) : null;
    });
    app.get("/api/admin/perfis", async () => adminRepo.getPerfis());
    app.get("/api/admin/audit-log", async () => adminRepo.getAuditLog());
    app.post("/api/admin/audit-log", async (req) => {
        const body = z.object({
            data: z.string(),
            usuario: z.string(),
            acao: z.string(),
            entidade: z.string(),
            entidadeId: z.string(),
            detalhes: z.string(),
        }).parse(req.body);
        const all = adminRepo.getAuditLog();
        const rec = { id: `LOG-${String(all.length + 1).padStart(3, "0")}`, ...body };
        all.unshift(rec);
        return rec;
    });
    app.get("/api/admin/parametros", async () => adminRepo.getParametros());
    app.put("/api/admin/parametros/:chave", async (req) => {
        const params = z.object({ chave: z.string() }).parse(req.params);
        const body = z.object({ valor: z.string() }).parse(req.body);
        return adminRepo.updateParametro(params.chave, body.valor);
    });
}

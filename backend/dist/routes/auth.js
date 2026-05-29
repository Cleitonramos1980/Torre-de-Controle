import { z } from "zod";
import { queryRows } from "../repositories/baseRepository.js";
import { signAuthToken } from "../utils/jwt.js";
export async function authRoutes(app) {
    app.post("/api/auth/login", async (req, reply) => {
        try {
            const body = z.object({
                usuario: z.string().trim().optional(),
                senha: z.string().optional(),
                email: z.string().trim().optional(),
                password: z.string().optional(),
            }).parse(req.body ?? {});
            const usuario = (body.usuario ?? body.email)?.toUpperCase();
            const senha = (body.senha ?? body.password)?.toUpperCase();
            console.log("[auth] ========== LOGIN ATTEMPT ==========");
            console.log("[auth] Usuario informado:", usuario ?? "(vazio)");
            if (!usuario || !senha) {
                console.log("[auth] Campos vazios - usuario ou senha nao preenchidos");
                return reply.status(400).send({ error: "Informe o usuario e a senha" });
            }
            console.log("[auth] Conectando ao Oracle...");
            // Busca principal por NOME_GUERRA (ativo)
            let rows = await queryRows(`SELECT
         DECRYPT(SENHABD, USUARIOBD) AS SENHA,
         MATRICULA,
         NOME,
         NOME_GUERRA,
         USUARIOBD
       FROM PCEMPR
       WHERE UPPER(NOME_GUERRA) = :username
         AND SITUACAO = 'A'`, { username: usuario.toUpperCase() });

            // Fallback: busca por USUARIOBD se não encontrou por NOME_GUERRA
            if (rows.length === 0) {
                rows = await queryRows(`SELECT
         DECRYPT(SENHABD, USUARIOBD) AS SENHA,
         MATRICULA,
         NOME,
         NOME_GUERRA,
         USUARIOBD
       FROM PCEMPR
       WHERE UPPER(USUARIOBD) = :username
         AND SITUACAO = 'A'`, { username: usuario.toUpperCase() });
            }

            // Diagnóstico: verificar se existe mas está inativo
            if (rows.length === 0) {
                const diagRows = await queryRows(`SELECT MATRICULA, NOME, SITUACAO FROM PCEMPR WHERE UPPER(NOME_GUERRA) = :username OR UPPER(USUARIOBD) = :username AND ROWNUM <= 1`, { username: usuario.toUpperCase() });
                if (diagRows.length > 0) {
                    console.log("[auth] Usuario encontrado mas inativo. SITUACAO:", diagRows[0].SITUACAO);
                    return reply.status(401).send({ error: "Usuario encontrado mas inativo no sistema. Contate o administrador." });
                }
            }

            console.log("[auth] Conexao com Oracle OK - Query executada com sucesso");
            console.log("[auth] Registros encontrados:", rows.length);
            if (rows.length === 0) {
                console.log("[auth] Nenhum usuario encontrado com NOME_GUERRA/USUARIOBD:", usuario.toUpperCase());
                return reply.status(401).send({ error: "Usuario nao encontrado ou inativo" });
            }
            const user = rows[0];
            console.log("[auth] Usuario encontrado:", {
                matricula: user.MATRICULA,
                nome: user.NOME,
                nomeGuerra: user.NOME_GUERRA,
                usuarioBD: user.USUARIOBD ? "***" : "NULL/VAZIO",
                senhaDecrypt: user.SENHA ? "*** (retornou valor)" : "NULL/VAZIO",
            });
            if (user.SENHA !== senha) {
                console.log("[auth] Senha incorreta - senha digitada nao confere com DECRYPT");
                return reply.status(401).send({ error: "Senha incorreta" });
            }
            console.log("[auth] Senha correta! Criando sessao JWT...");
            const PORTARIA_MATRICULAS = new Set(["338"]);
            const matriculaStr = String(user.MATRICULA);
            const perfil = PORTARIA_MATRICULAS.has(matriculaStr) ? "PORTARIA" : "ADMIN";
            const token = signAuthToken({
                sub: matriculaStr,
                nome: user.NOME,
                email: user.NOME_GUERRA,
                perfil,
            });
            console.log("[auth] Sessao criada com sucesso");
            console.log("[auth] ========== LOGIN OK ==========");
            return {
                success: true,
                token,
                user: {
                    id: String(user.MATRICULA),
                    nome: user.NOME,
                    name: user.NOME,
                    email: user.NOME_GUERRA,
                    nomeGuerra: user.NOME_GUERRA,
                    perfil: "ADMIN",
                    ativo: true,
                },
                expiresIn: 8 * 60 * 60,
            };
        }
        catch (error) {
            console.error("[auth] ========== ERRO NO LOGIN ==========");
            console.error("[auth] Tipo do erro:", error?.constructor?.name);
            console.error("[auth] Mensagem:", error?.message);
            console.error("[auth] Stack:", error?.stack);
            return reply.status(500).send({ error: "Erro interno ao processar login. Verifique o terminal para detalhes." });
        }
    });
    app.get("/api/auth/me", async (req, reply) => {
        const authUser = req.authUser;
        if (!authUser) {
            return reply.status(401).send({ error: { message: "Nao autenticado." } });
        }
        const PORTARIA_MATRICULAS = new Set(["338"]);
        const perfil = PORTARIA_MATRICULAS.has(String(authUser.sub)) ? "PORTARIA" : authUser.perfil;
        return {
            id: authUser.sub,
            nome: authUser.nome,
            email: authUser.email,
            perfil,
        };
    });
}

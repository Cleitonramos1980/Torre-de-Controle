# Torre de Controle - Producao

## Arquitetura de runtime
- runtime/node/node.exe (runtime Node empacotado)
- backend/dist/server.js (API Fastify)
- frontend/server.mjs (servidor estatico + proxy /api)

## Portas padrao
- Frontend HTTP: FRONTEND_PORT=3345
- Frontend HTTPS: FRONTEND_HTTPS_PORT=3344
- Backend: PORT=3333

## Diretorios importantes
- Logs: logs/
- Uploads backend: backend/uploads/
- Configuracao: .env
- Backups: backups/

## Seguranca operacional
- Nao versionar .env.
- Nao registrar segredos em log.
- Trocar obrigatoriamente JWT_SECRET_KEY e AUTH_STATIC_PASSWORD.
- Limitar acesso de rede as portas expostas.

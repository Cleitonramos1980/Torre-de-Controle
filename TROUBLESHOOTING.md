# Troubleshooting - Torre de Controle

## Porta ocupada
Use status.cmd e ajuste .env (PORT / FRONTEND_PORT).

## Backend nao sobe
1. Execute database\check-db.cmd
2. Verifique logs\backend.err.log
3. Confirme segredos (JWT_SECRET_KEY, AUTH_STATIC_PASSWORD)

## Frontend nao abre
1. Verifique logs\frontend.err.log
2. Teste http://127.0.0.1:3344
3. Valide se frontend/dist/index.html existe

## Oracle/WinThor
1. Revise ORACLE_* no .env
2. Rode oracle\check-oracle.cmd
3. Verifique permissoes SELECT nas tabelas WinThor

## Migration falhou
Rode database\migrate.cmd e confira logs\migration.log.

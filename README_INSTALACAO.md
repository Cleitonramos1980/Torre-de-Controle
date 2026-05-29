# Torre de Controle - Instalacao Windows

## 1. Pre-requisitos
- Windows 10/11 ou Windows Server 2019+
- Permissao de administrador para instalar auto-start do servico
- Acesso de rede ao Oracle/WinThor
- Credenciais Oracle validas: ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING

## 2. Instalacao rapida
1. Extraia o ZIP para uma pasta temporaria.
2. Execute install.cmd como administrador.
3. Informe (ou aceite) o diretorio de instalacao. Padrao: C:\TorreControle.
4. Preencha o arquivo .env no diretorio instalado.
5. Rode healthcheck.cmd para validar.

## 3. Operacao
- Iniciar: start.cmd
- Parar: stop.cmd
- Reiniciar: restart.cmd
- Status: status.cmd
- Healthcheck: healthcheck.cmd

## 4. Banco e Oracle
- Migrate: database\migrate.cmd
- Check DB: database\check-db.cmd
- Check Oracle: oracle\check-oracle.cmd

## 5. Atualizacao e rollback
- Backup: backup.cmd
- Atualizacao: update.cmd
- Restore: restore.cmd (informe o diretorio de backup)

## 6. URLs padrao
- Frontend: http://127.0.0.1:3344
- Backend API: http://127.0.0.1:3333/api/health

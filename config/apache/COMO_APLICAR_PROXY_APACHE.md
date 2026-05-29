1. Copie o arquivo de vhost para o servidor Apache publico:
   - Origem: `C:\TorreControle\config\apache\visitante.rodriguescolchoes.com.br.conf`
   - Destino (Debian/Ubuntu): `/etc/apache2/sites-available/visitante.rodriguescolchoes.com.br.conf`

2. No servidor Apache, habilite modulos e o site:
   ```bash
   sudo a2enmod proxy proxy_http headers rewrite ssl
   sudo a2ensite visitante.rodriguescolchoes.com.br.conf
   sudo apachectl configtest
   sudo systemctl reload apache2
   ```

3. Garanta rede entre Apache publico e Torre interno:
   - Apache precisa acessar `http://10.101.10.13:3344`.
   - Se houver firewall interno, liberar origem do servidor Apache para destino `10.101.10.13:3344`.

4. Testes de validacao:
   ```bash
   curl -I https://visitante.rodriguescolchoes.com.br/
   curl -I https://visitante.rodriguescolchoes.com.br/visitante/cadastro/teste-token
   curl -I https://visitante.rodriguescolchoes.com.br/api/health
   ```

Resultado esperado:
- HTTP 200 na raiz.
- HTTP 200 na rota `/visitante/cadastro/...` (SPA).
- HTTP 200 no `/api/health`.

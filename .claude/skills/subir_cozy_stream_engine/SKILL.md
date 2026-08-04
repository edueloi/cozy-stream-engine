---
name: subir_cozy_stream_engine
description: Use when the user asks to deploy/publish the cozy-stream-engine (JCS SDR platform) to a VPS, restart it in production, or troubleshoot production vs. local environment conflicts (e.g. "subir na vps", "deploy do sdr", "colocar o cozy stream engine em produção").
---

# Subir o cozy-stream-engine (JCS SDR) na VPS

## Credenciais

As credenciais reais (SSH, senha do banco, SESSION_SECRET) estão em `.claude/skills/subir_cozy_stream_engine/credentials.md`, que é gitignored — NUNCA commitar esse arquivo nem colar seu conteúdo em lugar versionado. Se esse arquivo não existir neste checkout, pergunte ao usuário antes de tentar redescobrir/recriar credenciais.

## Ambiente de produção atual

- **VPS**: 72.62.15.206 (Ubuntu 24.04), acesso via SSH com chave (`~/.ssh/ecolife_vps` no ambiente onde a chave foi gerada). **Esta VPS é compartilhada com o Ecolife CRM** — cuidado ao rodar comandos que afetam o Nginx ou o MySQL global, sempre restrinja a mudanças ao site/banco deste projeto.
- **Domínio**: https://sdr.jcssolucoes.com.br (DNS já apontado, SSL via Certbot/Let's Encrypt com renovação automática).
- **Stack**: sem Docker/EasyPanel — Node 22 (via nvs, já instalado na VPS) + PM2 + Nginx + MySQL 8.0, mesmo padrão do Ecolife e demais projetos do usuário.
- **Diretório do projeto**: `/var/www/cozy-stream-engine`.
- **Banco**: `jcs_sdr`, usuário dedicado `jcs_sdr` (não usa `root` em produção).
- **Processo PM2**: `cozy-stream-engine` — roda `npm run start`, que é `node --env-file=.env scripts/node-server.mjs`, escutando na porta interna 3008.
- **Nginx**: proxy reverso de `sdr.jcssolucoes.com.br` (porta 80/443) para `127.0.0.1:3008`.
- **Repositório**: público em `https://github.com/edueloi/cozy-stream-engine`.

## Detalhe importante: o build NÃO é um servidor Node nativo

Este projeto usa TanStack Start com Vite puro (sem preset Nitro `node-server` explícito). O `npm run build` gera `dist/server/server.js`, que exporta apenas um handler estilo Cloudflare Workers (`{ fetch(request, env, ctx) }`), sem `.listen()`. Isso é diferente do Ecolife, cujo Nitro gera `.output/server/index.mjs` com servidor HTTP nativo.

Por isso existe `scripts/node-server.mjs` no repositório: um wrapper pequeno que usa `node:http` + a Fetch API nativa do Node 22 para expor esse handler como um servidor HTTP tradicional, lendo a porta de `process.env.PORT`. O script `start` do `package.json` já usa `node --env-file=.env` para carregar o `.env` do projeto automaticamente (não depende da variável já estar exportada no shell).

**Não tente rodar `node dist/server/server.js` diretamente** — não abre porta nenhuma (é só o handler, sem servidor). Sempre use `npm run start`.

Se algum dia o `vite.config.ts` mudar para usar um preset Nitro `node-server` (como o Ecolife), esse wrapper deixa de ser necessário e o entry point passa a ser `.output/server/index.mjs` com `.listen()` nativo — nesse caso, ajuste o comando do PM2 e pode remover `scripts/node-server.mjs`.

## Atualizar o deploy (dia a dia)

```bash
cd /var/www/cozy-stream-engine
git pull origin main
npm install
npm run build
pm2 restart cozy-stream-engine --update-env
```

Se `prisma/schema.prisma` ou as migrations mudaram:

```bash
cd /var/www/cozy-stream-engine && npm run db:migrate
```

Verificar logs:

```bash
pm2 logs cozy-stream-engine --lines 50
```

## Deploy do zero (nova VPS, ou se precisar recriar)

1. **Conectar via SSH** com chave.
2. **Base já deve estar instalada** se a VPS já roda outros projetos do usuário (nginx, mysql-server, certbot, nvs/Node 22, pm2). Se for VPS nova, seguir os mesmos passos da skill `subir_vps` do Ecolife antes disso.
3. **Criar banco e usuário dedicado**:
   ```sql
   CREATE DATABASE IF NOT EXISTS jcs_sdr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER IF NOT EXISTS 'jcs_sdr'@'localhost' IDENTIFIED BY '<senha>';
   GRANT ALL PRIVILEGES ON jcs_sdr.* TO 'jcs_sdr'@'localhost';
   FLUSH PRIVILEGES;
   ```
4. **Clonar o repositório**: `git clone https://github.com/edueloi/cozy-stream-engine.git /var/www/cozy-stream-engine` (repo público, não precisa de auth).
5. **Criar `.env` de produção** (`chmod 600`, nunca commitado):
   ```
   DATABASE_URL="mysql://jcs_sdr:<senha-url-encoded>@localhost:3306/jcs_sdr"
   SESSION_SECRET="<gerar chave aleatoria de 32+ caracteres>"
   PORT=3008
   APP_URL="https://sdr.jcssolucoes.com.br"
   ```
   Atenção: caracteres especiais na senha do banco precisam ser URL-encoded na `DATABASE_URL` (ex.: `@` → `%40`, `#` → `%23`). As chaves de IA (`OPENAI_API_KEY`/`GEMINI_API_KEY`) não precisam ir no `.env` — cadastre pela tela Configurações > Providers do próprio sistema depois do primeiro login.
6. **Instalar dependências, migrar, buildar**:
   ```bash
   cd /var/www/cozy-stream-engine && npm install && npm run db:migrate && npm run build
   ```
7. **Subir com PM2**:
   ```bash
   pm2 start npm --name cozy-stream-engine -- run start
   pm2 save
   ```
   (o `pm2 startup` para sobreviver a reboot já deve estar configurado globalmente na VPS, compartilhado com o Ecolife — checar com `pm2 startup` se for VPS nova.)
8. **Configurar Nginx** (`/etc/nginx/sites-available/cozy-stream-engine`, symlink em `sites-enabled`, proxy para `127.0.0.1:3008`), testar com `nginx -t`, `systemctl reload nginx`.
9. **Emitir SSL**: `certbot --nginx -d sdr.jcssolucoes.com.br --non-interactive --agree-tos -m <email> --redirect`.
10. **Firewall**: já deve estar liberado (22/80/443) se compartilha VPS com outro projeto — confirmar com `ufw status`.

## Erros comuns

- **Servidor não escuta em porta nenhuma / curl não conecta**: alguém tentou rodar `node dist/server/server.js` direto em vez de `npm run start`. Ver seção "Detalhe importante" acima.
- **Porta errada (ex: 3000 ao invés de 3008)**: o wrapper depende do `.env` ser lido via `--env-file=.env` (já configurado no script `start`). Se rodar manualmente sem esse flag e sem `PORT` exportado no shell, cai no default 3000.
- **404 logo após `systemctl reload nginx`**: geralmente transitório — o Nginx ainda estava recarregando a config. Testar de novo depois de 2-3s antes de investigar mais a fundo.
- **`DATABASE_URL` com senha contendo `@`/`#`/outros caracteres especiais**: precisa URL-encode, senão o driver MySQL interpreta a URL errado.
- **Precisa autenticar `git pull`**: não deveria — o repo é público. Se aparecer pedido de usuário/senha, confirmar que o remote está em `https://github.com/edueloi/cozy-stream-engine.git` e não no antigo repo privado `SistemasJCS/cozy-stream-engine`.

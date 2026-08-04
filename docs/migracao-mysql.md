# Migração para MySQL local

O banco local da aplicação é `jcs_sdr`. A primeira migração cria a fundação nova: usuários, perfis, papéis, sessões, organizações, configurações, leads e conhecimento. As demais tabelas Supabase continuam no projeto até seus módulos serem portados para Prisma; removê-las antes disso quebraria funções já publicadas.

## Executar

No PowerShell, use Node 22 e aplique o schema:

```powershell
nvs use 22
npx prisma migrate dev --name initial_mysql
```

Depois, configure `DATABASE_URL` e `SESSION_SECRET` a partir de `.env.mysql.example`. Não reutilize credenciais do Supabase.

Para IA, escolha `AI_PROVIDER="openai"` com `OPENAI_API_KEY`, ou `AI_PROVIDER="gemini"` com `GEMINI_API_KEY`. O Gemini é usado pela sua API compatível com OpenAI; use os identificadores de modelo Gemini nas configurações dos agentes, por exemplo `gemini-2.5-flash`.

## Regras da nova camada

- Toda consulta de dados de tenant deve filtrar por `organizationId`, obtido com `getCurrentOrganizationId`.
- Papéis são validados com `getUserRoles` ou `assertManager`; MySQL não substitui o RLS do Supabase.
- `knowledge_chunks.embedding` é JSON. A busca semântica usa `cosineSimilarity` na aplicação e deve limitar candidatos por organização e fonte.
- O schema usa `utf8mb4` no banco para preservar corretamente caracteres como `Ação`, `Prospecção` e `Configurações`.

# Valle Sales CRM

Aplicacao Vite + React + Supabase para gestao comercial.

## Ambiente

Copie `.env.example` para `.env` e preencha com os dados do projeto Supabase que sera usado:

```env
VITE_SUPABASE_PROJECT_ID="seu-project-ref"
VITE_SUPABASE_URL="https://seu-project-ref.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sua-anon-publishable-key"
```

As tres variaveis precisam apontar para o mesmo project ref. A chave publishable/anon deve ser copiada do painel do Supabase do novo projeto.

## Comandos

```bash
npm install
npm run dev
npm run check
npm run build
```

`npm run check` executa lint, typecheck, testes e build de producao.

## Migracao Supabase

1. Crie o novo projeto no Supabase.
2. Atualize `.env` e `supabase/config.toml` com o novo project ref.
3. Rode as migrations em `supabase/migrations`.
4. Importe os dados exportados do projeto antigo.
5. Confirme que o bucket privado `lead-attachments` existe. Ele ja e criado pela primeira migration.
6. Configure os secrets da edge function `leads-api`:

```bash
SUPABASE_DB_URL=postgresql://...
SUPABASE_URL=https://seu-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

7. Deploye a edge function `leads-api`.
8. No painel do Supabase, configure Auth providers e redirect URLs do dominio publicado e dos previews.

## Dashboard e-KONTROLL

A rota `/ekontroll` usa a Edge Function `ekontroll-api` como proxy seguro para os métodos `listar_empresas`, `fiscal_volumetria`, `folha_volumetria` e `faturamento`. As chaves não devem ser colocadas no `.env` do frontend. Configure-as como secrets da função:

```bash
supabase secrets set \
  EKONTROLL_API_KEY="..." \
  EKONTROLL_API_KEY_EMPRESA="..." \
  EKONTROLL_API_KEY_CLIENTE="..."
```

Os métodos de métricas (`fiscal_volumetria`, `folha_volumetria` e `faturamento`) exigem uma `API_KEY_CLIENTE` ativa e autorizada para cada empresa/método no e-KONTROLL. A chave do escritório e a `API_KEY_EMPRESA` permitem autenticar e listar empresas, mas não substituem a autorização individual de cliente.

Depois publique a função `ekontroll-api`. A API e-KONTROLL limita as consultas de volumetria a intervalos de até 12 meses; o painel respeita esse formato de competência mensal.

O login Google usa o OAuth nativo do Supabase. Configure o provider Google no painel do Supabase antes de publicar.

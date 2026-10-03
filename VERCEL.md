# Deploy do GRACIOU na Vercel
A preparação está concluída, mas este projeto **não foi publicado**.

## Configuração
1. Crie um projeto na Vercel apontando para este repositório.
2. Mantenha o framework como Vite ou configure o build command `npm run build`.
3. Use `dist` como output directory.
4. Cadastre no ambiente da Vercel, sem versionar valores:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `PUBLIC_BASE_URL`
   - `MP_ACCESS_TOKEN` — placeholder até configurar Mercado Pago
   - `MP_WEBHOOK_SECRET` — placeholder até configurar Mercado Pago
5. Faça o deploy pela interface da Vercel ou pelo CLI somente quando decidir publicar.

## Arquitetura
- `api/[...path].js` é a Vercel Function catch-all e encaminha `/api/*` ao Express.
- `backend/repositorio.js` usa Supabase quando a chave de service role está disponível.
- SQLite não é carregado quando `VERCEL=1`; ele permanece apenas para desenvolvimento local.
- O frontend usa a própria origem em produção para chamar `/api/*`.
- A chave `SUPABASE_SERVICE_ROLE_KEY` nunca é referenciada por HTML ou JavaScript do navegador.

## Validação local
```powershell
node scripts/testar-vercel-functions.mjs
npm run build
```

O teste usa um pedido temporário e deve removê-lo ao final. Não configure credenciais reais do Mercado Pago durante essa validação.

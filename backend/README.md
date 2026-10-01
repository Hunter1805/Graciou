# GRACIOU — Backend local (API de pedidos)

API local em **Node.js + Express** com banco **SQLite** para receber e
armazenar os pedidos da GRACIOU.

> **Etapa atual: pedidos + Checkout Pro opcional.** O Mercado Pago só é
> ativado quando as credenciais de ambiente estão configuradas. Nenhum dado de
> cartão é recebido ou salvo.

---

## 1. Requisitos

| Item | Versão | Por quê |
|---|---|---|
| **Node.js** | **22.5 ou superior** | O SQLite vem embutido no Node (`node:sqlite`). Em versões anteriores o backend **não sobe**. |

Confira a sua versão:

```bash
node --version
```

> **Como saber se o Node tem SQLite embutido:**
> ```bash
> node -e "require('node:sqlite'); console.log('sqlite ok')"
> ```
> Se aparecer `sqlite ok`, está tudo certo. Se der erro, atualize o Node para 22.5+.

Foi uma escolha deliberada **não** usar `better-sqlite3`: ele exigiria
compilador C++ (node-gyp) no Windows e uma dependência binária a mais para
manter. O `node:sqlite` é síncrono, já vem no Node e mantém o projeto sem
serviço pago — **nada de PostgreSQL, nada de banco na nuvem.**

### ⚠️ Se aparecer `'node' não é reconhecido como um comando`

Isso não é problema do projeto: é o `PATH` do terminal. O Node fica em
`C:\Program Files\nodejs\` e precisa estar no `PATH` da sessão.

**Confira** se a pasta está registrada (deve responder algo com `nodejs`):

```powershell
[Environment]::GetEnvironmentVariable('Path','Machine') -split ';' | Select-String node
```

**Se estiver registrada mas o comando ainda falhar**, o seu terminal foi
aberto antes da instalação do Node e ficou com o `PATH` antigo. **Feche e
abra um terminal novo** — o erro desaparece. Se preferir resolver na hora,
rode este comando na sessão atual do PowerShell:

```powershell
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
```

Depois disso, `node --version` e `npm --version` respondem normalmente.

---

## 2. Instalação

O backend tem o **seu próprio `package.json`**, separado do frontend.

```bash
cd backend
npm install
```

Isso instala apenas o **Express** (e suas dependências internas).
Nenhum pacote de Shopify, Nuvemshop ou PostgreSQL é instalado.

---

## 3. Como iniciar

```bash
cd backend
npm run dev     # desenvolvimento: reinicia sozinho ao salvar (node --watch)
```

ou

```bash
cd backend
npm start       # execução simples, sem observador de arquivos
```

Saída esperada no terminal:

```
[graciou-api] API no ar em http://localhost:3001
[graciou-api] banco: ...\backend\data\graciou.sqlite
[graciou-api] catalogo: 8 produtos · cupons sincronizados: 1
[graciou-api] Mercado Pago: Checkout Pro configurado quando credenciais existem.
```

Para parar: `Ctrl + C`.

Para mudar a porta: defina `PORT` antes de subir (ex.: `PORT=4001 npm start`).
Para mudar o arquivo do banco: defina `GRACIOU_DB` com o caminho desejado.

---

## 4. Banco de dados

- **Arquivo:** `backend/data/graciou.sqlite`
- Criado automaticamente no primeiro start, junto das tabelas e índices.
- O SQLite em modo WAL cria também `graciou.sqlite-wal` e `graciou.sqlite-shm`.
  Isso é normal.

### Tabela `orders`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | TEXT (PK) | Número do pedido, gerado **pelo servidor** |
| `criado_em` | TEXT | Data/hora local no momento da gravação |
| `cliente_nome` | TEXT | |
| `cliente_email` | TEXT | |
| `cliente_telefone` | TEXT | |
| `cliente_cpf` | TEXT | |
| `endereco_json` | TEXT | Endereço completo em JSON |
| `itens_json` | TEXT | Itens em JSON (produto, tamanho, cor, quantidade, preço) |
| `forma_pagamento` | TEXT | `pix` ou `cartao` |
| `status_pagamento` | TEXT | Nasce como `aguardando`; o painel pode mudar |
| `cupom_codigo` | TEXT | `NULL` quando não há cupom |
| `subtotal` | INTEGER | Em **centavos** |
| `desconto` | INTEGER | Em **centavos** |
| `frete` | INTEGER | Em centavos; `NULL` quando o valor não foi informado |
| `total` | INTEGER | Em centavos; `NULL` enquanto o frete for `NULL` |
| `status_pedido` | TEXT | Nasce como `aguardando_pagamento` |
| `rastreio` | TEXT | Começa vazio; preenchido pelo painel |
| `observacoes` | TEXT | Notas internas (o painel acrescenta ou substitui) |
| `pedido_youdraw` | TEXT | Número do pedido na YouDraw, preenchido pelo painel |
| `atualizado_em` | TEXT | Data/hora da última alteração feita pelo painel |

> **Não existe coluna de cartão.** Não há número, CVV, validade nem bandeira —
> nem no schema, nem no código.

### Tabela `coupons`

`codigo` (PK), `tipo`, `valor`, `ativo`, `valor_minimo`, `validade`, `limite_usos`.

Ela é um **espelho consultável** dos cupons oficiais. A **autoridade
continua sendo `dados/catalogo.js`** (`META.cupons`): a cada start o backend
copia o catálogo para a tabela. Se os dois divergirem, **vale o catálogo.**

---

## 5. Endpoints

Base: `http://localhost:3001`

### `GET /api/health`

Teste de vida. Responde `200` com o status do serviço, do banco e do catálogo.

```bash
curl http://localhost:3001/api/health
```

```json
{
  "status": "OK",
  "ok": true,
  "banco": { "tipo": "sqlite", "arquivo": "graciou.sqlite", "conectado": true },
  "catalogo": { "produtos": 8, "integro": true, "problemas": 0 },
  "pagamentoIntegrado": false,
  "usuarioAdmin": false
}
```

### `POST /api/orders`

Cria o pedido. Responde **201** com o número do pedido.

```bash
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "cliente": {
      "nome": "Maria de Souza",
      "email": "maria@exemplo.com",
      "telefone": "(11) 98765-4321",
      "cpf": "123.456.789-01"
    },
    "endereco": {
      "cep": "01310-100", "estado": "SP", "cidade": "São Paulo",
      "bairro": "Bela Vista", "rua": "Avenida Paulista",
      "numero": "1000", "complemento": "Apto 42"
    },
    "itens": [
      { "productId": "tee-raizes", "tamanho": "M", "quantidade": 1 }
    ],
    "pagamento": { "forma": "pix" },
    "cupom": { "codigo": "BEMVINDO10" }
  }'
```

Resposta:

```json
{
  "ok": true,
  "numero": "GR-20260928-0002-YBJ4",
  "id": "GR-20260928-0002-YBJ4",
  "pedido": { "...": "pedido completo, já recalculado" },
  "recalculadoNoServidor": true,
  "valoresRecebidosDoClienteIgnorados": []
}
```

### `GET /api/orders/:id`

Consulta um pedido pelo número.

```bash
curl http://localhost:3001/api/orders/GR-20260928-0002-YBJ4
```

`200` com o pedido, ou `404` se não existir.

### Rotas administrativas

Todas exigem sessão: `Authorization: Bearer <token>` (o token sai do login).

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/api/admin/login` | Confere as credenciais e devolve um token de sessão |
| `POST` | `/api/admin/logout` | Invalida a sessão atual |
| `GET` | `/api/admin/orders` | Lista resumida, com filtro `?status=` e `?limite=` |
| `GET` | `/api/admin/orders/:id` | Detalhe completo + resumo pronto para a YouDraw |
| `PATCH` | `/api/admin/orders/:id` | Atualiza só os campos enviados |

Sem sessão válida a resposta é `401` e nada é devolvido.

---

## 6. Painel de pedidos (`/admin.html`)

A tela do operador. É uma página estática na **raiz do projeto**
(`admin.html`), servida pelo mesmo Vite do frontend — não é um segundo app.

### Como abrir

```bash
# 1. API com o painel configurado
cd backend
$env:ADMIN_EMAIL='admin@graciou.com'
$env:ADMIN_PASSWORD='uma-senha-boa'
npm run dev

# 2. Frontend, na raiz do projeto (outro terminal)
npm run dev
```

Depois: **http://localhost:3000/admin.html**

> Sem `ADMIN_EMAIL`/`ADMIN_PASSWORD`, o login responde `503` e o painel avisa
> que não está configurado — ele **nunca** aceita qualquer senha.

Se a API estiver em outra porta (por exemplo, a 3001 já ocupada por outro
programa), aponte o painel para ela pela URL:

```
http://localhost:3000/admin.html?api=http://localhost:3002
```

### O que o operador faz aqui

1. **Lista** os pedidos, com filtro por status e um contador por status. A lista
   é enxuta de propósito: nome, cidade, peças, total e status. **CPF, endereço e
   itens só trafegam quando o detalhe é aberto.**
2. **Abre o detalhe:** dados do cliente, endereço completo, itens (tamanho, cor,
   quantidade, unitário), totais, cupom e observações.
3. **Copia o resumo da YouDraw** — texto puro, já formatado pelo servidor
   (`admin.js` → `resumoParaYouDraw`), pronto para colar na plataforma.
4. **Atualiza o pedido:** status, status de pagamento, código de rastreio,
   número do pedido na YouDraw e observação interna.

### Regras que o painel respeita

- **Só o que mudou é enviado.** O formulário compara cada campo com o valor
  atual; campo igual fica de fora do `PATCH`. É isso que garante o requisito
  "atualizar sem apagar dados existentes".
- **Observação tem dois modos:** acrescentar ao fim (padrão) ou substituir tudo
  (a caixa de seleção). O texto anterior nunca some por acidente.
- **Status vêm do servidor.** O `<select>` é montado a partir de
  `meta.statusPermitidos` na resposta da lista — não há lista duplicada no HTML.
- **A sessão morre sozinha** em 30 minutos, e o token fica **só na memória**:
  recarregar a página exige novo login. Ele não vai para `localStorage`.
- **Nada de dinheiro é editável.** Total, frete e desconto vêm do servidor; o
  painel só os exibe.

### Teste automatizado

```bash
node scripts/rodar-qa-admin.mjs
```

### Mercado Pago: testes e operação segura
O teste unitário não chama a internet:

```bash
cd backend
npm run testar:pagamentos
```

O teste de integração sobe uma API GRACIOU e um mock local da API do Mercado
Pago. Ele não usa cobrança real nem credencial real:

```bash
npm run testar:pagamentos:integracao
```

Para o primeiro teste real, use somente credenciais de **teste** do Mercado
Pago, configure `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e uma `PUBLIC_BASE_URL`
HTTPS acessível pelo Mercado Pago. Não use `localhost` para webhook real e não
publique em produção nesta etapa. O Access Token nunca é colocado em HTML,
logs, banco ou resposta HTTP.


Abre o painel num navegador real e verifica: carregamento sem erro de console,
recusa de senha errada, login, lista vinda da API, abertura do detalhe com o
resumo da YouDraw, e uma atualização de verdade — confirmando depois **no
servidor** que o dado persistiu e que cliente, endereço e itens continuam
intactos. Se a API não estiver na 3001:

```powershell
$env:GRACIOU_API='http://localhost:3002'; node scripts/rodar-qa-admin.mjs
```

---

## 7. O que o servidor decide (e o navegador não)

Esta é a parte mais importante do backend. **Nada que venha do navegador é
confiável para dinheiro.**

O servidor **recalcula do zero**, usando `dados/catalogo.js` como fonte única:

| Informação | Origem |
|---|---|
| Preço de cada peça | **Catálogo** (Pix e cartão têm valores próprios) |
| Nome do produto | Catálogo |
| Subtotal | Recalculado |
| Desconto do cupom | Recalculado a partir do cupom oficial |
| Quantidade de peças | Recalculada |
| Frete | Regra do catálogo (2+ peças = grátis) |
| Total | Recalculado (`null` enquanto o frete não tiver valor) |
| Número do pedido | Gerado pelo servidor |

Do navegador só se aproveitam **quais produtos**, **tamanho**, **cor** e
**quantidade** — e ainda assim validados um a um:

- produto precisa existir no catálogo e estar ativo;
- tamanho precisa pertencer à grade oficial daquele produto
  (pedir `XG` no Short, que só vai até `GG`, é recusado com `400`);
- cor, se enviada, precisa existir; se ausente, usa a cor principal;
- quantidade precisa ser inteiro entre 1 e 99.

**Campos como `total`, `subtotal`, `desconto`, `frete` e `precoUnitario`
enviados pelo cliente são ignorados em silêncio** e recalculados. Quando o
cliente manda algum deles, o pedido é gravado com uma observação interna
registrando isso, para auditoria.

### Frete (importante)

`META.valorFrete` continua `null`, porque o valor do frete normal **não foi
informado pelo fornecedor**. O backend respeita isso e **não inventa número**:

| Peças | `frete` | `total` |
|---|---|---|
| 2 ou mais | `0` (frete grátis) | calculado |
| 1 | `null` | `null` |

Quando o valor do frete normal for definido, basta preencher
`META.valorFrete` em `dados/catalogo.js` — o backend passa a calcular o total
sozinho, sem mudar mais nada.

---

## 8. Segurança e privacidade nesta etapa

- **CORS apenas para o frontend local** (`localhost:3000`, `localhost:3100`,
  `127.0.0.1` nas mesmas portas). **Não existe `*`** na configuração. Uma
  origem desconhecida não recebe o header `Access-Control-Allow-Origin`, então
  o navegador bloqueia a leitura da resposta.
- **Logs sem dado pessoal.** O console mostra apenas método, rota, status,
  tempo e o número do pedido. Nunca nome, e-mail, CPF, telefone ou endereço.
- **Nenhum dado de cartão** é recebido, validado ou gravado.
- **Mercado Pago sem credenciais não é ativado**; quando configurado, o
  Checkout Pro não recebe nem armazena dados de cartão.

> ⚠️ **Ainda não é para produção.** Não há autenticação, rate limiting, HTTPS,
> validação de CPF por dígito verificador nem política de retenção de dados
> (LGPD). Isso entra antes de qualquer uso real.

---

## 9. Testes

Com a API no ar, rode a suíte de testes do backend:

```bash
cd backend
npm run testar
```

Ou a partir da raiz do projeto:

```bash
node scripts/testar-backend.mjs
```

A suíte sobe contra `http://localhost:3001` e cobre: health, pedido com uma
camiseta, pedido com duas peças, frete grátis, cupom `BEMVINDO10`, recusa de
produto inexistente, recusa de tamanho inválido, tentativa de adulterar o
total, consulta por ID e a ausência de qualquer dado de cartão no banco.

---

## 10. Estrutura

```
GRACIOU/
├── admin.html            # painel de pedidos (na raiz, servido pelo Vite)
└── backend/
    ├── package.json      # dependências e scripts (dev, start, testar)
    ├── servidor.js       # Express: rotas, CORS restrito e logs seguros
    ├── admin.js          # sessões, validação do painel e resumo da YouDraw
    ├── regras.js         # validação + recálculo no servidor (o coração)
    ├── db.js             # SQLite: schema, conexão e acesso a orders/coupons
    ├── README.md         # este arquivo
    └── data/
        └── graciou.sqlite # banco (criado no primeiro start)
```

O catálogo **não** é copiado para o backend: `regras.js` carrega
`../dados/catalogo.js` diretamente. Existe uma única fonte de produtos,
preços, cupons e regra de frete em todo o projeto.

---

## 11. Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `Cannot find module 'node:sqlite'` | Node anterior a 22.5. Atualize o Node. |
| `EADDRINUSE: address already in use :::3001` | Já existe algo na porta 3001. Feche o outro processo ou suba com `PORT=4001 npm start`. |
| `Cannot find module 'express'` | Faltou `npm install` dentro de `backend/`. |
| Checkout mostra "Não foi possível registrar o pedido." | A API está desligada. Suba com `npm run dev` e tente de novo — o carrinho e o pedido local continuam salvos. |
| Painel diz "Painel administrativo não configurado" (`503`) | Faltam `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente da API. Defina as duas e reinicie. |
| Painel mostra "A API não respondeu em http://localhost:3001" | A API não está no ar, ou está em outra porta. Suba o backend, ou abra `admin.html?api=http://localhost:<porta>`. |
| Painel volta para o login sozinho | A sessão expirou (30 min) ou a API foi reiniciada — as sessões vivem só em memória. Entre novamente. |

---

## 12. Mercado Pago — Checkout Pro
A integração usa somente `fetch` server-side; nenhum SDK ou token chega ao
frontend. O backend lê estas variáveis de ambiente:

- `MP_ACCESS_TOKEN`: Access Token de **teste** durante o desenvolvimento.
- `MP_WEBHOOK_SECRET`: segredo para validar `x-signature` do webhook.
- `PUBLIC_BASE_URL`: domínio público HTTPS usado nas `back_urls` e no webhook.

Copie `.env.example` para `.env` e preencha somente localmente. O `.env` está
no `.gitignore`; nunca faça commit de credenciais.

### Endpoints
- `POST /api/payments/create-preference` — recebe apenas `{ "orderId": "GR-..." }`.
  O servidor relê o pedido do SQLite, bloqueia `total`/`frete` nulos e cria a
  preferência com `external_reference` igual ao ID do pedido.
- `POST /api/payments/webhook` — valida assinatura, consulta o pagamento na API
  do Mercado Pago e só então atualiza o banco. Repetições são idempotentes.
- `GET /api/payments/status/:orderId` — devolve apenas o status seguro do pedido.

Estados recebidos: `approved` vira `pago`; `pending`/`in_process` viram
`pendente`; `rejected`/`cancelled` viram `recusado`. Apenas `approved` muda
`status_pedido` para `pago`, e uma aprovação nunca é rebaixada por notificação
atrasada.

### Teste local
A API do Mercado Pago exige uma `PUBLIC_BASE_URL` acessível para webhook. Não
use `localhost` em um teste real de webhook. Para a primeira etapa, use as
credenciais de teste e um túnel HTTPS de desenvolvimento; não publique em
produção. Os testes automatizados do projeto usam o cliente MP simulado e não
fazem cobrança real.

## 13. Próximos passos (fora desta etapa)

1. **UX de pedido:** validar CPF por dígito verificador, máscara de CEP e
   consulta de endereço.
2. **Mercado Pago:** preferência de pagamento (Checkout Pro) + webhook de
   confirmação, atualizando `status_pagamento` para `pago` automaticamente —
   hoje essa mudança é feita à mão, pelo painel.
3. **Exportação em lote:** hoje o painel copia o resumo de **um** pedido por
   vez. Falta o CSV com os pedidos filtrados.
4. **Operação:** migrations versionadas (hoje o schema é criado com
   `CREATE TABLE IF NOT EXISTS`), backups, HTTPS, rate limiting no login e
   políticas de LGPD.

---

*GRACIOU — Grace in every thread.*
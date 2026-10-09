# GRACIOU — Loja independente

> Streetwear premium. Loja própria, sem Shopify e sem Nuvemshop.

A GRACIOU é uma loja independente: frontend estático servido pelo Vite, API
serverless compatível com Vercel usando Supabase em produção (SQLite somente
no desenvolvimento local), carrinho persistente, checkout, cupons e um painel
de pedidos para a operação. A produção é feita na **YouDraw**, por lançamento
manual de um pedido formatado — o sistema gera o resumo, o operador cola.

---

## 🗂️ Estrutura de Arquivos

```
GRACIOU/
├── index.html          # Hub local: links para todas as páginas
├── preview.html        # Homepage (hero, ticker, grid assimétrico, filosofia)
├── collection.html     # Coleção: grade, filtros, ordenação
├── cart.html           # Carrinho persistente
├── checkout.html       # Dados do cliente, endereço e revisão do pedido
├── rastreio.html       # Acompanhamento público (número do pedido + e-mail)
├── admin.html          # Painel de pedidos (restrito, exige login)
│
├── dados/
│   ├── catalogo.js     # ⭐ FONTE ÚNICA: 8 produtos, preços, cupons, frete
│   └── catalogo.mjs    # Espelho ESM do catálogo (backend/testes)
│
├── assets/
│   ├── graciou-store.js  # Navegação e apoio de UI das páginas
│   ├── graciou-cpf.js    # Máscara e validação do CPF (dígito verificador)
│   ├── graciou-cep.js    # Máscara do CEP e consulta ao ViaCEP
│   └── tree-icon.png     # Asset da marca
│
├── api/[...path].js     # Vercel Function catch-all para /api/*
├── vercel.json          # Build e configuração da Function
├── backend/             # API local + repositório
│   ├── servidor.js      # Express: rotas, CORS restrito, logs seguros
│   ├── repositorio.js   # Supabase em produção; SQLite local como fallback
│   ├── acompanhamento.js# Consulta pública: resposta mínima, timeline, rate limit
│   ├── regras.js        # Validação e recálculo no servidor
│   ├── admin.js         # Sessões, validação do painel, resumo da YouDraw
│   └── db.js            # SQLite somente no desenvolvimento local
│
├── supabase/migrations/ # Migrações incrementais (aplicar no Supabase)
│
├── scripts/            # Verificações e ferramentas de QA
├── logs/               # Capturas de tela das verificações
│
├── layout/  sections/  snippets/  templates/  config/  locales/
│                       # ☠️ Tema Shopify original — código morto.
│                       # Não é carregado por nenhuma página. Ver §Arquivo morto.
└── PLANO-TECNICO.md    # Diagnóstico e plano que originou esta arquitetura
```

---

## 🎨 Tokens de Design

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-ecru` | `#FDFDD0` | Fundo principal |
| `--color-moss-green` | `#4F5D3A` | Acento / blocos |
| `--color-navy` | `#1A1A1A` | Tipografia / CTA |
| `--font-heading` | Barlow Condensed 700/800 | Títulos, logos |
| `--font-body` | DM Sans 300/400/500 | Corpo, labels |

---

## 🚀 Como rodar

Precisa de **Node.js 22.5 ou superior** (o SQLite vem embutido no Node).

```bash
# 1. Dependências (frontend e backend têm package.json separados)
npm install
cd backend && npm install && cd ..

# 2. API local — terminal 1
cd backend
npm run dev
# → [graciou-api] API no ar em http://localhost:3001
# Em produção, a API é carregada por api/[...path].js na Vercel.

# 3. Frontend — terminal 2, na raiz
npm run dev
# → http://localhost:3000
```

Depois abra **http://localhost:3000** — o hub lista todas as páginas.

Para usar o painel de pedidos, defina as credenciais antes de subir a API:

```powershell
cd backend
$env:ADMIN_EMAIL='voce@graciou.com'
$env:ADMIN_PASSWORD='uma-senha-boa'
npm run dev
```

Depois: **http://localhost:3000/admin.html**

> Se `node` não for reconhecido no terminal, veja a seção *Problemas comuns* em
> [`backend/README.md`](backend/README.md) — é o `PATH`, não o projeto.

---

## 💾 O catálogo é a fonte única

`dados/catalogo.js` é a **autoridade** sobre produtos, preços, cupons e a regra
de frete. O backend o carrega diretamente (`regras.js`) — nada de copiar preços
para o banco ou para o HTML.

- O navegador **nunca** define valor. Ele informa *quais produtos*, tamanho, cor
  e quantidade; o servidor recalcula preço, desconto, frete e total.
- A tabela `coupons` do SQLite é apenas um **espelho consultável**; se divergir
  do catálogo, vale o catálogo.

Validar o catálogo a qualquer momento:

```bash
npm run verificar:catalogo
```

Confere IDs e slugs únicos, a presença dos 8 produtos oficiais do Drop 01, os
campos obrigatórios e se nenhum preço foi inventado.

---

## 🛒 O fluxo de uma compra

```
collection.html → cart.html → checkout.html → API /api/orders
                                                     ↓
                                         pedido gravado (aguardando_pagamento)
                                                     ↓
                                  e-mail de confirmação (Brevo, idempotente)
                                                     ↓
                                   API /api/payments/create-preference
                                                     ↓
                                       Checkout Pro Mercado Pago
                                                     ↓
                                    webhook assinado → consulta MP → pago
                                                     ↓
                                     admin.html: operador lança na YouDraw
```

Estados do pedido: `aguardando_pagamento → pago → encomendar_na_youdraw →
pedido_na_youdraw → em_producao → enviado → entregue` (ou `cancelado`).

### Acompanhamento do pedido

O cliente abre `rastreio.html` e informa **número do pedido + e-mail da compra**
(sem conta). A API (`POST /api/orders/tracking`) responde só o necessário:
status, linha do tempo (etapas **realmente registradas**), cidade/UF de destino,
observação pública e rastreio. O **e-mail nunca vai na URL**, tentativas são
limitadas por IP e a combinação errada devolve **mensagem genérica**. CPF,
telefone, endereço completo e notas internas nunca são expostos.

Cada atualização manual do operador (status, transportadora, código, link HTTPS,
observação pública) fica registrada em `order_events` com data e hora — e aparece
imediatamente na consulta do cliente. O pagamento **não** é marcado como
confirmado só porque o pedido foi criado.

> **Antes de publicar no Supabase:** aplique a migração
> `supabase/migrations/20261007_acompanhamento_pedidos.sql`. Localmente o SQLite
> se migra sozinho no boot.

---

## ⚠️ O que ainda NÃO existe

- **Mercado Pago em produção.** O Checkout Pro está implementado para ambiente
  de teste, mas não deve ser publicado ainda. O pagamento só vira `pago` após
  webhook assinado e consulta server-side à API do Mercado Pago.
- **Conta de cliente.** A compra usa apenas os dados do checkout, sem cadastro.
- **E-mail de rastreio, nota fiscal e LGPD.** O e-mail de **confirmação do
  pedido** já sai pela Brevo (`backend/email.js`, idempotente); falta o e-mail de
  rastreio, a emissão fiscal e a política de retenção de dados.
- **Preços e imagens reais.** Os preços vêm da tabela da YouDraw; as fotos de
  frente/costas/detalhes dependem de ensaio. Enquanto faltarem, a loja não deve
  ir ao ar.

> O backend **não é para produção** ainda: falta HTTPS, rate limiting no login e
> política de retenção de dados. Veja `backend/README.md` §8.

---

## ☠️ Arquivo morto: o tema Shopify

As pastas `layout/`, `sections/`, `snippets/`, `templates/`, `config/` e
`locales/` são o **tema Shopify OS 2.0 original** (Liquid). Elas foram a origem
do design — hero, grid assimétrico, paleta e tipografia — mas **não são
executadas em lugar nenhum**: nenhuma página do site carrega esses arquivos, e
não há Shopify em nenhuma parte do projeto em funcionamento.

Elas ficam no repositório **apenas como referência visual**. Não tente
"consertar" o tema: ele tem erros conhecidos (por exemplo, `templates/product.json`
é JSON inválido e aponta para uma seção inexistente) e não é o caminho do
projeto. O caminho é a loja independente descrita acima.

---

## 🔧 Verificações

```bash
npm run verificar:catalogo                # integridade do catálogo
node scripts/testar-validacao-checkout.js # CPF (dígito verificador) e CEP (ViaCEP)
node scripts/testar-backend.mjs           # suíte da API (com a API no ar)
node scripts/testar-email-brevo.mjs       # e-mail de confirmação (API temporária)
node scripts/rodar-qa-admin.mjs           # painel de pedidos num navegador real
```

---

*GRACIOU — Grace in every thread.*

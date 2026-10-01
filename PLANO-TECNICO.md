# GRACIOU — Relatório Técnico e Plano de Loja Independente

> **Data:** 25/09/2026
> **Escopo:** Diagnóstico do projeto atual + plano para loja independente (sem Shopify / sem Nuvemshop)
> **Status desta etapa:** apenas análise. Nenhum arquivo existente foi alterado ou removido.
> **Arquivo criado nesta etapa:** apenas este `PLANO-TECNICO.md`.

---

## 1. Resumo executivo

O projeto atual **não é uma loja**. É um **protótipo visual estático** composto por três páginas HTML autônomas (temas Shopify OS 2.0 escritos em Liquid que *nunca rodaram em uma loja real*) mais um pequeno catálogo de dados em JavaScript.

Conclusões diretas:

| Pergunta da etapa | Resposta |
|---|---|
| Já existe carrinho? | **Não** (não funcional). Existe apenas UI decorativa de carrinho e um `localStorage` de teste |
| Já existe checkout? | **Não** |
| Já existe banco de dados? | **Não** |
| Já existe backend? | **Não** |
| Já existe autenticação / admin? | **Não** |
| Existe dependência do Shopify? | **Sim, como código-fonte.** Todo o diretório Liquid é um tema Shopify. Ele deve ser **arquivado, não apagado**, porque o conteúdo visual (seções, classes, textos) é a fonte do design |
| Existe código reaproveitável? | **Sim:** todo o CSS/HTML/JS visual (≈ 6 arquivos), os 8 produtos já catalogados em JS, e os textos da marca |

**Recomendação central:** manter o protótipo **intacto** como "fonte de design", extrair dele o HTML/CSS e reconstruir por cima uma aplicação própria (frontend independente + API + banco + Mercado Pago + painel admin). A YouDraw permanece **fora do sistema**, como operação manual — o sistema entrega apenas um *pedido formatado* para ser lançado na plataforma da YouDraw.

---

## 2. Tecnologia atual do projeto

### 2.1 O que existe de fato

| Camada | Tecnologia encontrada | Observação |
|---|---|---|
| Linguagem | HTML5 estático + CSS3 puro + JavaScript ES6 (IIFE, sem módulos) | Zero dependências de runtime |
| Servidor de dev | **Vite 5.2** (`devDependencies` em `package.json`), script `npm run dev` na porta 3000 | Único artefato real de Node. **Não há `vite.config.*`** — usa apenas o servidor estático padrão do Vite |
| Tipografia | Google Fonts via CDN (`Barlow Condensed`, `DM Sans`, `Oswald`) | Dependência externa de runtime |
| "Tema" | **Shopify Online Store 2.0** (Liquid + `{% schema %}` + templates JSON) | Código de tema completo, mas nunca publicado |
| CSS utilitário | Tailwind via CDN (`cdn.tailwindcss.com`) | ⚠️ Apenas em `layout/theme.liquid`; as páginas reais usam CSS próprio |
| Backend | ❌ inexistente | — |
| Banco de dados | ❌ inexistente | — |
| Versionamento | ❌ não há repositório Git no projeto | Risco (ver §7) |

### 2.2 Detalhe importante: existem **dois mundos paralelos** dentro da mesma pasta

**Mundo A — Protótipo estático (funciona hoje no navegador)**
- `preview.html` (1.436 linhas) — homepage completa, self-contained
- `collection.html` (1.328 linhas) — grade de coleção, filtros, sort, wishlist
- `index.html` (327 linhas) — *dashboard* interno que apenas linka para os dois anteriores
- `assets/tree-icon.png` — único asset de imagem do projeto
- `assets/graciou-store.js` — catálogo dos 8 produtos + carrinho de teste

**Mundo B — Tema Shopify Liquid (código morto no estado atual)**
- `layout/theme.liquid`, `templates/*.json`, `sections/*.liquid`, `snippets/*.liquid`, `config/settings_schema.json`, `locales/pt-BR.json`

O Mundo B **referencia o Mundo A pela metade**: `theme.liquid` carrega `assets/graciou-base.css` e `assets/graciou-main.js`, mas esses arquivos foram escritos para as **classes BEM do tema** (`graciou-header`, `main-product`, etc.), enquanto os HTMLs do Mundo A usam **classes próprias** (`header__inner`, `p-card`, `col-hero`). Ou seja: **as duas metades nunca foram executadas juntas**. Não existe integração real entre elas.

---

## 3. Inventário de arquivos: protótipo vs. reaproveitável

### 3.1 Classificação

| Arquivo | Classificação | Pode ser reaproveitado? |
|---|---|---|
| `index.html` | **Protótipo interno** (hub de preview com texto genérico) | ⚠️ Não como página. Serve de referência visual mínima |
| `preview.html` | **Protótipo de alta fidelidade** | ✅ **Sim — principal ativo de design.** CSS e markup das seções (hero, ticker, grid assimétrico, filosofia, editorial, banner, footer) |
| `collection.html` | **Protótipo de alta fidelidade** | ✅ **Sim.** Grade, toolbar, filtros, sort, layout toggle, badges, states — o melhor candidato a virar o componente de listagem |
| `assets/graciou-store.js` | **Base de dados real, código de teste** | ✅ **Sim, mas só os dados.** O array `products` com os 8 produtos do Drop 01 é real; o carrinho em `localStorage` é descartável |
| `assets/graciou-base.css` | **Código morto de tema** | ✅ **Parcial.** Os *design tokens* (cores, fontes, espaçamentos, botões, foco, print) são reaproveitáveis. As regras específicas do tema Shopify não |
| `assets/graciou-main.js` | **Código morto de tema** | ⚠️ **Parcial.** `initMobileMenu`, `initSearchBar`, `initProductGallery`, `initAccordions` são lógica de UI reaproveitável. `gracioQuickAdd` e `updateCartCount` **não** (dependem de `/cart/add.js` do Shopify) |
| `assets/tree-icon.png` | **Asset real da marca** | ✅ **Sim** |
| `layout/theme.liquid` | **Código morto / acoplado Shopify** | ❌ Não. Depende de `content_for_header`, `content_for_layout`, `{% section %}`, `settings.*` |
| `templates/index.json` | **Configuração Shopify** | ❌ Não. É *preset* de tema. Útil só como referência de copy |
| `templates/product.json` | **Configuração Shopify** | ❌ Não — e **referencia uma seção que não existe** (`product-recommendations`, com erro de sintaxe JSON). Ver §7 |
| `templates/collection.json` | **Configuração Shopify** | ❌ Não |
| `sections/custom-header.liquid` | **Código morto / acoplado Shopify** | ⚠️ Estrutura HTML útil como referência; `linklists`, `routes.*` e `cart.item_count` não |
| `sections/hero-editorial.liquid` | **Código morto / acoplado Shopify** | ⚠️ Referência de markup |
| `sections/asymmetric-grid.liquid` | **Código morto / acoplado Shopify** | ⚠️ A **estrutura HTML/classes BEM é muito boa** e casa com o CSS base. Referência forte para o componente de grade assimétrica |
| `sections/brand-philosophy.liquid` | **Código morto / acoplado Shopify** | ⚠️ Referência de markup |
| `sections/featured-drop-banner.liquid` | **Código morto / acoplado Shopify** | ⚠️ Referência de markup |
| `sections/main-product.liquid` | **Código morto / acoplado Shopify** | ⚠️ **Referência muito útil.** Estrutura de página de produto (galeria, variantes, acordeões, trust badges) é o molde para a futura PDP |
| `sections/main-collection.liquid` | **Código morto / acoplado Shopify** | ⚠️ Referência de markup |
| `sections/custom-footer.liquid` | **Código morto / acoplado Shopify** | ⚠️ Referência; o `{% form 'customer' %}` de newsletter não funciona fora do Shopify |
| `snippets/product-card.liquid` | **Código morto / acoplado Shopify** | ⚠️ Bom molde de componente de card |
| `snippets/icon-tree.liquid` | **Código morto** | ✅ **Sim** — é SVG puro com parâmetros simples (largura/cor). Trivialmente portável |
| `snippets/head-seo.liquid` | **Código morto / acoplado Shopify** | ⚠️ Referência: o JSON-LD `Product`/`ClothingStore` continua correto em qualquer site |
| `snippets/sizing-guide.liquid` | **Código morto** | ✅ **Sim, provavelmente** — tabela de medidas é conteúdo estático (não verificado linha a linha nesta etapa) |
| `config/settings_schema.json` | **Configuração Shopify** | ⚠️ Referência útil: mapeia quais campos devem existir no painel admin próprio (logo, redes sociais, etc.) |
| `locales/pt-BR.json` | **Configuração Shopify** | ⚠️ Referência de strings PT-BR |
| `README.md` | **Documentação** | ⚠️ **Desatualizado.** Descreve o deploy no Shopify, o que contradiz a decisão de loja independente. Precisa ser reescrito (não nesta etapa) |
| `package.json` / `package-lock.json` | **Real** | ✅ Sim (Vite como dev server) |

### 3.2 Resumo visual

```
┌─────────────────────────────────────────────────────────────┐
│  REAPROVEITÁVEL (visual)                                    │
│  preview.html · collection.html · tree-icon.png             │
│  graciou-base.css (tokens) · graciou-main.js (UI)           │
│  snippets/icon-tree.liquid · snippets/sizing-guide.liquid   │
├─────────────────────────────────────────────────────────────┤
│  REAPROVEITÁVEL (dados/copy)                                │
│  graciou-store.js → array `products` (8 itens do Drop 01)   │
│  textos de marca em templates/*.json e *.liquid             │
├─────────────────────────────────────────────────────────────┤
│  PROTÓTIPO / CÓDIGO MORTO (não usar)                        │
│  layout/theme.liquid · config/settings_schema.json          │
│  sections/*.liquid (todos) · templates/*.json · locales     │
│  index.html (hub de preview) · README.md (desatualizado)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Verificação específica: carrinho, checkout, banco, backend

### 4.1 Carrinho — ❌ não existe (apenas fachada)

Há **três implementações diferentes e nenhuma real**, sobrepostas:

1. **`collection.html` (linhas ~1291–1309)** — a função `addToCart(btn)` apenas:
   - troca o texto do botão para `✓ ADICIONADO` por 2,2 s;
   - incrementa **visualmente** o badge do header (`parseInt + 1`).
   - **Não guarda nada.** Recarregar a página volta ao estado inicial. O badge começa fixo em "2" no HTML.
2. **`preview.html` (linhas 1055, 1083, 1113, 1144)** — os botões `+ ADICIONAR` usam `onclick` **inline** que só muda texto/cor por 2 s. **Não existe nem contagem.**
3. **`assets/graciou-store.js`** — este **é** um carrinho funcional de verdade, mas em `localStorage` (`graciou-cart-v1`), com `addToCart`, `removeFromCart`, `clearCart`, `count()`.
   - **Problema:** as páginas carregam esse arquivo, mas **nunca o chamam**. Nenhum elemento das páginas usa `data-graciou-cart-count`, e nenhum botão chama `GRACIOU_STORE.addToCart`. Os scripts inline duplicam a lógica de forma decorativa.

**Conclusão:** o carrinho de `localStorage` é o esqueleto lógico correto (chave por `produto + tamanho + variante`, merge de quantidade), mas está **desconectado da interface**. É útil como referência de modelagem, não como código a manter.

### 4.2 Checkout — ❌ não existe

Nenhum arquivo, rota, formulário de endereço, cálculo de frete ou etapa de pagamento. O único resquício é `config/settings_schema.json` → `enable_dynamic_checkout` (checkbox de tema Shopify) e `head-seo.liquid`, ambos inertes fora do Shopify.

### 4.3 Banco de dados — ❌ não existe

- Nenhum arquivo `.sql`, nenhum schema, nenhuma migração.
- Nenhum ORM ou driver de banco em `package.json` (apenas `vite`).
- O "banco" hoje é: **um array hardcoded** em `assets/graciou-store.js` (8 produtos) + `localStorage` do navegador.
- Note que os produtos das páginas HTML **não vêm desse array**: o conteúdo dos cards está **escrito à mão** no markup de `preview.html` e `collection.html`. Existem, portanto, **duas listas divergentes** de produtos (ver §7).

### 4.4 Backend — ❌ não existe

- Nenhum servidor, nenhuma função/rota de API.
- As únicas chamadas `fetch()` no projeto são `fetch('/cart/add.js')` e `fetch('/cart.js')` em `assets/graciou-main.js`. Essas rotas **só existem dentro do Shopify** — fora dele retornam 404. Ou seja, o único "backend" referenciado é o do Shopify, que foi descartado.
- Sem autenticação, sem sessão, sem painel administrativo, sem webhook.

### 4.5 O que ainda precisa ser construído (do zero)

| # | Módulo | Estado |
|---|---|---|
| 1 | Catálogo/banco de produtos (Drop 01, 8 itens, tamanhos, cores, estoque) | ❌ |
| 2 | Carrinho persistente real (client + server) | ❌ |
| 3 | Checkout (dados do cliente, endereço, frete, revisão) | ❌ |
| 4 | Cupons / regras de desconto | ❌ |
| 5 | Pagamento (Mercado Pago — Checkout Pro / Bricks + webhook) | ❌ |
| 6 | Criação e gestão de pedidos | ❌ |
| 7 | Painel administrativo (produtos, pedidos, cupons, estoque) | ❌ |
| 8 | Autenticação do admin | ❌ |
| 9 | Integração de saída para a **YouDraw** (exportação manual do pedido) | ❌ |
| 10 | E-mails transacionais (confirmação, pagamento aprovado) | ❌ |
| 11 | Fiscal / LGPD / termos / política de trocas | ❌ |
| 12 | Deploy, domínio, HTTPS, backups, monitoramento | ❌ |

---

## 5. Arquitetura proposta (loja independente)

### 5.1 Princípios

1. **Não substituir o design atual.** O protótipo é a fonte visual. A nova loja deve reproduzir fielmente hero, ticker, grid assimétrico, filosofia, footer, paleta e tipografia — reaproveitando o CSS existente como base, e não redesenhando.
2. **Frontend desacoplado do backend.** O visual vira uma SPA/MPA leve; os dados vêm de uma API própria.
3. **A YouDraw fica fora do sistema.** Nenhuma integração automática nesta fase (eles não expõem API pública de pedidos para o plano padrão). O sistema apenas **gera o pedido pronto para digitação** — um resumo formatado (SKU, tamanho, cor, quantidade, dados do cliente) copiável/exportável, para lançamento manual.
4. **Mercado Pago entra por último, mas é desenhado desde o início.** A ordem `pedido criado → pagamento pendente → pago → enviado à YouDraw` deve existir na modelagem de dados desde a primeira migração.

### 5.2 Stack sugerida (a confirmar com você)

Stack mínima, uma linguagem só, barata de hospedar:

| Camada | Sugestão | Por quê |
|---|---|---|
| Frontend | **Vite + JavaScript (ou React/Preact)** reaproveitando o CSS atual | Vite já está no projeto; mantém o design intacto |
| Backend/API | **Node.js + Fastify/Express** (ou Next.js API routes se preferir unificar) | Uma linguagem só; integra fácil com Mercado Pago |
| Banco | **PostgreSQL** (via Supabase/Neon) | Pedidos e cupons precisam de transação/consistência |
| ORM | Prisma | Migrações versionadas |
| Pagamento | **Mercado Pago** — Checkout Pro (mais rápido) ou Bricks (mais controle) + webhook de confirmação | Padrão no Brasil, Pix + cartão + boleto |
| Admin | Rota protegida na mesma aplicação (`/admin`) | Evita construir um segundo app |
| Imagens | Storage de objetos (S3/R2/Supabase Storage) | Substitui o `image_url` do Shopify |
| Deploy | Vercel/Railway/Render + domínio próprio com HTTPS | Simples e barato |

> ⚠️ Nada disso será instalado nesta etapa. É uma recomendação para aprovação.

### 5.3 Modelo de dados inicial (esboço)

```
products        id, slug, name, description, category, base_price, active, drop
product_colors  id, product_id, name, hex
variants        id, product_id, color_id, size, sku, price, stock, youdraw_id
carts           id, token, created_at, updated_at
cart_items      id, cart_id, variant_id, quantity, unit_price
orders          id, code, customer_id, status, subtotal, discount, shipping, total,
                payment_status, payment_id, mp_preference_id, youdraw_status, created_at
order_items     id, order_id, variant_id, quantity, unit_price, snapshot_json
customers       id, name, email, phone, cpf, address_json
coupons         id, code, type, value, min_subtotal, usage_limit, uses, expires_at, active
admins          id, email, password_hash, role
```

**Máquina de estados do pedido (proposta):**

```
carrinho → pedido_criado → aguardando_pagamento → pago → lancado_youdraw → enviado → entregue
                                  ↓                   ↓
                              expirado/cancelado   reembolsado
```

### 5.4 Pontos de atenção de design (regras de marca)

Estas regras foram extraídas do seu contexto e **devem virar requisito do catálogo**, não depender de disciplina manual:

- **Frente das camisetas: somente `GRACIOU` centralizado.**
- **Estampas principalmente nas costas.**
- Paleta: `#FDFDD0` (creme), `#4F5D3A` (verde-musgo), `#1A1A1A` (preto), `#3A4529` (verde-musgo escuro), além de marrom e verde militar.
- Por isso, o modelo de produto precisa de **campos de imagem separados por face**: `image_front`, `image_back`, `image_details[]`. O crop/ordem da galeria da PDP deve sempre abrir pela **frente** e mostrar a **costa** em segundo.
- `config/settings_schema.json` já traz `color_ecru`, `color_moss_green`, `color_navy`, `logo`, `favicon`, `social_*`, `font_heading`, `font_body` — esse conjunto é exatamente o que o **painel admin próprio** deve expor como configurações da loja.

### 5.5 Dados dos 8 produtos do Drop 01 (fonte: `assets/graciou-store.js`)

| # | Nome | Categoria atual no arquivo | Cor sugerida | Tamanhos |
|---|---|---|---|---|
| 1 | Camiseta A Graça Permanece | Drop 01 | Verde-musgo | PP–XG |
| 2 | Camiseta Firmado | Drop 01 | Preto | PP–XG |
| 3 | Camiseta O Sagrado Não Precisa Gritar | Drop 01 | Off-white | PP–XG |
| 4 | Camiseta Pela Graça | Drop 01 | Marrom | PP–XG |
| 5 | Camiseta Raízes | Drop 01 | Verde militar | PP–XG |
| 6 | Camiseta Dryfit Move With Faith | GRACIOU Move | Preto | P–GG |
| 7 | Camiseta Dryfit Forte e Serena | GRACIOU Move | Verde militar | P–GG |
| 8 | Short 2 em 1 Graciou Move | GRACIOU Move | Preto | P–GG |

`price: 0` em todos — **placeholders até receber a tabela de preços da YouDraw**.

---

## 6. Roadmap sugerido por fases

| Fase | Entrega | Depende de |
|---|---|---|
| **0. Fundação** *(pode começar já)* | Git init + `.gitignore`; arquivar o tema Shopify em `_arquivo/shopify-theme/` **sem apagar**; extrair CSS/HTML do protótipo para componentes; definir modelo de dados | nada |
| **1. Catálogo** | Banco + API de produtos + listagem e PDP reais usando o design atual | Fase 0; **preços e estoque da YouDraw** |
| **2. Carrinho** | Carrinho persistente ponta a ponta (substitui o `localStorage`) | Fase 1 |
| **3. Checkout + Cupons** | Dados do cliente, endereço, frete, cupons, revisão do pedido, criação do pedido `aguardando_pagamento` | Fase 2 |
| **4. Mercado Pago** | Preferência de pagamento, Pix/cartão, webhook, conciliação `pago` | Fase 3 + credenciais MP |
| **5. Painel Admin** | Login, CRUD de produtos/estoque, pedidos, cupons, exportação para a YouDraw | Fases 1–4 |
| **6. Operação** | E-mails transacionais, políticas (LGPD/trocas), domínio, HTTPS, backups, métricas | Fase 5 |

**Bloqueio imediato:** fases 1 em diante dependem de duas informações suas — **(a)** tabela de preços e SKUs da YouDraw; **(b)** definição de quem hospeda e paga a infraestrutura.

---

## 7. Riscos, inconsistências e decisões importantes

### 7.1 Riscos altos

| # | Risco | Evidência | Mitigação |
|---|---|---|---|
| R1 | **`README.md` contradiz a estratégia do projeto.** Ele documenta deploy via Shopify CLI, `@shopify/cli`, `shopify theme push` e configuração no Admin Shopify — exatamente o que foi descartado | `README.md:60–106` | Reescrever o README para a arquitetura independente. **Não feito nesta etapa** (fora do escopo) |
| R2 | **Não existe repositório Git.** Não há histórico nem possibilidade de reverter | `glob` de `.git` → nenhum resultado | `git init` + primeiro commit antes de qualquer refatoração. Prioridade máxima |
| R3 | **Duas listas de produtos divergentes.** `graciou-store.js` tem os 8 itens corretos do Drop 01; os HTMLs exibem **12 produtos fictícios** ("Hoodie Oversized Raízes", "Cargo Pant Shadow", "Bucket Hat Terra", "Meia Árvore", "Shoulder Bag Terra"...) que **não fazem parte do Drop 01** | `graciou-store.js:8–15` vs `collection.html:646–1117` e `preview.html:1039–1154` | Tornar `graciou-store.js` (ou o banco) a **única** fonte de verdade. Toda a listagem deve ser renderizada a partir de dados |
| R4 | **Colisão de ID no catálogo JS.** Dois produtos diferentes usam `id: 'tee-graca'` (linhas 8 e 11) | `graciou-store.js:8,11` | Bug real: `getProduct('tee-graca')` retorna o errado e o carrinho faria merge indevido de dois produtos distintos. Corrigir para `tee-graca-permanece` e `tee-pela-graca` |
| R5 | **Dependência de Tailwind via CDN** em `layout/theme.liquid:37` (`cdn.tailwindcss.com`) | — | CDN do Tailwind **não deve ir para produção** (peso, sem purge, aviso do próprio Tailwind). Como as páginas reais não usam Tailwind, o caminho certo é **remover**, não compilar |
| R6 | **Produtos sem preço.** Todos com `price: 0` | `graciou-store.js:8–15` | Bloqueia go-live. Sem preços da YouDraw não é possível calcular carrinho, cupom, frete nem pagamento |
| R7 | **Sem imagens reais.** Existe **um** asset no projeto (`tree-icon.png`). Todos os "produtos" são placeholders em SVG/gradiente | `glob` de imagens → 1 arquivo | Sem fotos de frente, costas e detalhes não há loja real. Depende de ensaio fotográfico |

### 7.2 Inconsistências técnicas menores (documentadas, não corrigidas)

| # | Item | Local | Impacto |
|---|---|---|---|
| I1 | **`templates/product.json` está quebrado em dois níveis**: (a) é JSON **inválido** — falta o fechamento de `"order": ["main", "product-recommendations"]` (fecha só com `]`); (b) referencia a seção `product-recommendations`, que **não existe** em `sections/` | `templates/product.json:7–15` | O tema nunca funcionaria em produção. Reforça que o Mundo B é código morto |
| I2 | **`graciou-store.js` é carregado depois de `</body>`** | `preview.html:1434` | Inválido em HTML; o navegador move o script para o body, mas é um erro de estrutura |
| I3 | **`collection.html` não tem `<html>` fechado antes do script** — o `</body>` ocorre na linha 1326 e o arquivo ainda contém `</html>` na 1327 com linha em branco extra | `collection.html:1325–1328` | Cosmético |
| I4 | **`collection.html:1274`** — `grid.appendChild(document.getElementById('empty-state').parentElement ? ... : null)` | `collection.html:1274` | Se a condição for falsa, `appendChild(null)` lança exceção. Bug latente no sort |
| I5 | **Classes fora de escopo em `preview.html`**: usa `collection-page`, `p-card`, `col-hero` (definidas só em `collection.html`) e `asym-*`/`product-card__*` (definidas só em `preview.html`) | ambos | Cada HTML é um CSS isolado de 1.300–1.400 linhas; **há bastante duplicação entre eles**. Na fase 0, unificar em um só CSS evita divergência de design |
| I6 | **`graciou-base.css` (1.382 linhas) casa com BEM do tema, não com os HTMLs** | — | Nenhuma classe BEM (`graciou-header`, `hero-editorial`, `asymmetric-grid`) é usada pelas páginas reais. O CSS "base" está, hoje, 100% inerte |
| I7 | **`assets/graciou-store.js` é código órfão** — as páginas o carregam, mas nenhum elemento usa `data-graciou-cart-count` nem chama `GRACIOU_STORE` | `preview.html:1434`, `collection.html:1325` | Manutenção enganosa: parece haver carrinho, e não há |
| I8 | **`index.html` (hub) preserva a decisão de Shopify**: o subtítulo diz "Painel de desenvolvimento local para visualização de mockups do tema Shopify OS 2.0" | `index.html:287` | Copy desatualizada |
| I9 | **`locales/pt-BR.json` e `config/settings_schema.json`** só têm função dentro do Shopify | — | Reaproveitar como **referência** de campos do admin e de strings PT-BR |
| I10 | **`README.md` diz "Tailwind CSS (produção): `npx tailwindcss ...`"** — não há `tailwind.config.js`, nem `assets/input.css`, nem Tailwind em `package.json` | `README.md:122–127` | Instrução que não funciona |

### 7.3 Decisões que precisam ser tomadas por você

1. **Arquivar ou apagar o tema Shopify?** Recomendo **arquivar** (`_arquivo/shopify-theme/`) e adicionar um comentário no topo de cada arquivo Liquid: `ARQUIVADO — referência de design, não executar`. Você pediu para não apagar nada; o arquivamento cumpre isso e evita que alguém tente "consertar o tema".
2. **SPA ou MPA?** SPA (React/Preact) reaproveita os componentes com mais facilidade; MPA é mais simples e mantém o HTML atual praticamente como está. **Recomendo MPA/Vite no início**, migrando para componentes só onde há repetição (card de produto, header, footer).
3. **Mercado Pago: Checkout Pro ou Bricks?** Checkout Pro é muito mais rápido de integrar e resolve Pix/cartão/boleto; Bricks dá controle visual (mais alinhado à marca) mas exige mais trabalho e PCI. **Recomendo Checkout Pro na primeira versão.**
4. **Preços e SKUs da YouDraw:** sem eles, nada além da Fase 0 pode ser concluído.
5. **Cupons:** precisam ser decididos como **regra de negócio** antes da modelagem — percentual, valor fixo, frete grátis, primeira compra, acúmulo com promoções?
6. **Frete:** cálculo por CEP (Correios/transportadora) ou valor fixo/tabela por região? Isso muda o modelo de dados e a complexidade do checkout.
7. **Login de cliente (conta) ou apenas e-mail no checkout?** Loja pequena costuma funcionar melhor **sem** conta obrigatória.
8. **Definição de "lançado na YouDraw":** o painel deve gerar (a) resumo em texto copiável, (b) planilha CSV, ou (c) PDF do pedido? Recomendo **CSV + resumo copiável**, com um campo de status manual por pedido.
9. **Fiscal:** a loja independente emite nota fiscal? Se sim, é uma integração adicional (ou processo manual) a prever.

---

## 8. O que NÃO foi feito nesta etapa (e por quê)

- Nenhum arquivo existente foi alterado.
- Nenhum arquivo foi apagado.
- Nenhuma dependência foi instalada; **nada de Shopify, Nuvemshop ou qualquer plataforma** foi adicionado.
- O design atual permanece **exatamente** como estava.
- `README.md` continua desatualizado (contradição registrada em **R1**) — corrigi-lo é uma alteração de conteúdo que exige sua aprovação sobre a arquitetura final.

---

## 9. Arquivos criados ou alterados

### Criados
- `C:\Users\PV\Downloads\GRACIOU\PLANO-TECNICO.md` *(este relatório)*

### Alterados
- **Nenhum.**

### Removidos
- **Nenhum.**

---

*GRACIOU — Grace in every thread.*
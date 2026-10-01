# GRACIOU — Análise de prontidão para produção
**Projeto:** `C:\Users\PV\Downloads\GRACIOU`  
**Data da análise:** 30/09/2026  
**Escopo:** auditoria sem publicação, sem migração de banco e sem alteração de hospedagem.

## 1. Veredito executivo
**Status: NÃO APTO para a primeira venda real.**

O código possui uma base funcional para loja, SQLite, painel administrativo,
Checkout Pro e recálculo de frete regional. Porém, ainda faltam decisões e
controles operacionais essenciais:

- não há hospedagem escolhida/configurada no repositório;
- não há prova de armazenamento persistente contratado;
- não há backup automatizado do SQLite;
- CORS só permite origens locais, portanto o domínio público ainda não funcionaria;
- `PUBLIC_BASE_URL` não é validada para exigir HTTPS;
- falta rate limiting/proteção adicional no login administrativo;
- não há páginas legais completas nem política de retenção de dados;
- o fluxo de produção ainda depende de configuração manual do domínio, webhook,
  segredos e operação da YouDraw.

**Nenhuma publicação foi feita. Nenhuma credencial real foi usada. Nenhum banco
foi migrado.**

## 2. Resumo por requisito
| Item auditado | Estado | Conclusão |
|---|---:|---|
| SQLite em hospedagem | ⚠️ | Pode permanecer somente com volume/disco persistente, backup e uma única instância |
| Hospedagem escolhida | ❌ | Não existe configuração de deploy no projeto nem evidência de contratação |
| Persistência | ❌ | Não comprovada |
| Perda em restart/deploy/escala | ⚠️ | Alto risco sem volume; SQLite não deve ser escalado horizontalmente |
| Mercado Pago + HTTPS | ⚠️ | Código usa `PUBLIC_BASE_URL`, mas não valida nem exige HTTPS |
| Credenciais em ambiente | ✅ | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` são lidos do ambiente |
| `.env` ignorado | ✅ | `.env` e `.env.*` estão no `.gitignore`; `.env.example` é exceção |
| Token no frontend | ✅ | Não há Access Token no HTML |
| Token nos logs/README | ✅* | Não encontrei valor real; nomes de variáveis aparecem legitimamente na documentação |
| CORS oficial | ❌ | Atualmente aceita apenas localhost e `Origin: null` |
| Rotas admin protegidas | ✅ | Middleware exige sessão; sem credencial configurada responde `503` |
| Painel sem login | ✅ | Rotas admin respondem `401`/`503` sem sessão |
| Webhook idempotente | ✅/⚠️ | Estado pago não é rebaixado; falta armazenamento de evento/idempotência explícito |
| Pagamento atrasado | ✅ | Aprovação não é rebaixada por status posterior |
| Frete regional | ✅ | Tabela central e recálculo server-side implementados |
| Total do servidor | ✅ | Recalculado em `backend/regras.js` |
| Cupom no frete | ✅ | Desconto incide no subtotal, frete é somado depois |
| Backup | ❌ | Não há script, rotina, arquivo ou política de backup no projeto |
| Falha do Mercado Pago | ⚠️ | Erros HTTP são tratados, mas faltam retry controlado, fila e observabilidade |
| URLs compatíveis | ⚠️ | Compatíveis conceitualmente, mas o frontend/API/CORS ainda são locais |
| Páginas legais | ❌ | Não foram encontradas páginas completas de termos, privacidade e trocas |

`✅*` significa que a auditoria não encontrou segredo real, mas a revisão final
do histórico Git ainda deve ser feita antes do primeiro commit/deploy.

## 3. SQLite e hospedagem
### 3.1 Estado atual
O backend usa `node:sqlite` e grava em:

```text
backend/data/graciou.sqlite
```

O banco usa WAL e cria também arquivos `-wal` e `-shm`. O diretório está no
`.gitignore`, e não há um arquivo de banco presente no workspace auditado neste
momento. Isso é adequado para desenvolvimento, mas não constitui backup nem
persistência de produção.

### 3.2 Pode usar SQLite em produção?

**Sim, mas apenas em uma implantação pequena e controlada**, com todas estas
condições:

1. armazenamento persistente montado exatamente no diretório configurado por
   `GRACIOU_DB`;
2. somente uma instância do backend escrevendo no banco;
3. deploy que não substitua o volume;
4. backup periódico testado e cópia fora da máquina/container;
5. procedimento de restauração documentado;
6. encerramento gracioso do processo;
7. monitoramento de espaço e integridade;
8. nenhuma escala horizontal automática.

SQLite **não deve permanecer como solução definitiva** se houver múltiplas
réplicas, workers concorrentes, necessidade de alta disponibilidade, volume
alto de pedidos ou painel e webhook distribuídos em várias instâncias.

### 3.3 Risco de perda
Sem armazenamento persistente, o arquivo pode ser perdido em:

- restart do container;
- novo deploy;
- troca de máquina/instância;
- autoscaling;
- rollback que recria o filesystem;
- rebuild da aplicação.

A documentação do Render informa que o filesystem padrão é efêmero e que as
alterações só sobrevivem com Persistent Disk; também informa que um disco fica
acessível a uma única instância, impedindo escala para múltiplas instâncias
[Render Persistent Disks](https://render.com/docs/disks).

O Railway oferece Volumes persistentes e variáveis de montagem, além de suporte
a backups em serviços com volume [Railway Volumes](https://docs.railway.com/guides/volumes)
e [Railway Volume Backups](https://docs.railway.com/volumes/backups).

## 4. Opção de hospedagem recomendada
### Recomendação para a primeira versão
**Railway com um serviço Node único + Volume persistente**, mantendo SQLite
temporariamente.

Configuração recomendada:

```text
serviço: backend Node.js
volume: /var/lib/graciou
GRACIOU_DB=/var/lib/graciou/graciou.sqlite
PORT: fornecida pela plataforma
PUBLIC_BASE_URL=https://www.seu-dominio.com
```

O frontend estático pode ser servido pelo próprio serviço ou separado, desde
que o domínio seja incluído no CORS do backend.

### Alternativa
**Render Web Service + Persistent Disk**, com o mesmo princípio de uma
única instância. O Render deixa claro que o disco persistente é necessário para
preservar arquivos entre deploys/restarts e que um serviço com disco não pode
ser escalado para múltiplas instâncias [Render Persistent Disks](https://render.com/docs/disks).

### O que não recomendo para SQLite
- serviço serverless com filesystem efêmero;
- Vercel Functions como processo principal do SQLite;
- múltiplas réplicas sem banco externo;
- volume local sem backup externo;
- deploy em filesystem padrão sem garantia escrita do provedor.

### Migração futura recomendada
Se a loja crescer, migrar para PostgreSQL gerenciado. Isso permite múltiplas
instâncias, backups gerenciados, concorrência e recuperação mais previsível.
Essa migração **não foi feita** nesta análise.

## 5. Mercado Pago e URLs
O módulo `backend/pagamentos.js` usa somente o backend para:

- criar preferência;
- consultar pagamento;
- processar webhook;
- validar `x-signature`;
- atualizar o pedido.

O `PUBLIC_BASE_URL` é utilizado para:

```text
success: /checkout.html?pagamento=sucesso&pedido=...
failure: /checkout.html?pagamento=falha&pedido=...
pending: /checkout.html?pagamento=pendente&pedido=...
webhook: /api/payments/webhook
```

Para a venda real, essa URL precisa ser pública e HTTPS. O projeto documenta
essa exigência, mas o código atual **não bloqueia** valores como `http://` ou
`localhost`. Isso deve ser uma validação obrigatória na inicialização antes do
go-live.

Não foi feita chamada real ao Mercado Pago nesta auditoria.

## 6. Credenciais e segredos
### Verificado
As credenciais são lidas por variáveis de ambiente:

- `MP_ACCESS_TOKEN`;
- `MP_WEBHOOK_SECRET`;
- `PUBLIC_BASE_URL`;
- `ADMIN_EMAIL`;
- `ADMIN_PASSWORD`.

O `.gitignore` contém:

```text
.env
.env.*
!.env.example
```

Não foi encontrado Access Token no HTML, no frontend ou em valores literais do
README. Os nomes das variáveis aparecem na documentação e no `.env.example`, o
que é esperado e não é um segredo.

### Pendências
Antes do deploy:

- revisar o histórico Git e eventuais artefatos fora do workspace;
- rotacionar qualquer token que tenha sido usado em terminal compartilhado;
- configurar credenciais de teste primeiro;
- confirmar que logs do provedor não capturam headers `Authorization`;
- nunca imprimir o conteúdo de `process.env`;
- definir uma política de rotação do Access Token e do segredo do webhook.

## 7. CORS e painel administrativo
### CORS atual
O backend permite apenas hosts locais:

```text
localhost:3000
localhost:3100
localhost:5173
localhost:4173
127.0.0.1 nas mesmas portas
::1 nas mesmas portas
Origin: null
```

Isso é adequado para desenvolvimento, mas **não para o domínio oficial**. No
go-live, deve existir uma variável como:

```text
FRONTEND_ORIGIN=https://www.seu-dominio.com
```

O backend deve permitir somente essa origem HTTPS, removendo `Origin: null` e
as origens locais do ambiente de produção.

### Admin
As rotas administrativas usam `Authorization: Bearer` e sessão em memória.
Sem sessão, o painel não lista nem abre pedidos. Isso foi validado na suíte.

Riscos restantes antes de produção:

- sessão em memória é perdida no restart;
- não há rate limiting no login;
- não há bloqueio progressivo de tentativas;
- não há MFA;
- não há auditoria persistente das alterações administrativas;
- o token de sessão não usa cookie seguro, pois fica em memória no frontend.

Para uma primeira versão pequena, pode permanecer temporariamente, mas deve
ser tratado como risco operacional alto.

## 8. Webhook e idempotência
### Pontos positivos
- o webhook não confia apenas no redirect do navegador;
- consulta o pagamento diretamente no Mercado Pago;
- valida `external_reference`;
- confere preferência, moeda e valor;
- `approved` transforma o pedido em pago;
- notificações `pending`/`rejected` não rebaixam um pedido já pago;
- notificações repetidas não criam pedidos novos.

### Riscos
A idempotência atual é baseada no estado do próprio pedido, não em uma tabela
explícita de eventos processados. Para maior robustez, antes da primeira venda
real é recomendável guardar:

```text
mp_payment_id UNIQUE
mp_event_id ou hash da notificação
recebido_em
processado_em
resultado
```

Isso facilita auditoria, replay controlado e investigação de falhas. O índice
atual de `mp_payment_id` não é UNIQUE, então ainda existe uma melhoria de
integridade a fazer.

## 9. Frete, total e cupons
A auditoria confirmou que:

- uma peça em PR, RS, SC, ES, MG, RJ ou SP usa `1799` centavos;
- uma peça em DF, GO, MT, MS, Norte ou Nordeste usa `2499` centavos;
- duas ou mais peças usam `0` centavos;
- UF é normalizada e validada;
- o backend calcula o frete novamente;
- valores de frete enviados pelo navegador não são confiáveis;
- o cupom é aplicado somente ao subtotal dos produtos;
- o total é `subtotal - desconto + frete`.

Os testes regionais e a validação visual do carrinho passaram.

## 10. Backup e recuperação
**Não existe backup implementado.** Não foram encontrados:

- script de backup;
- agendamento;
- cópia externa;
- teste de restauração;
- retenção definida;
- criptografia/controle de acesso documentado para cópias.

Antes da primeira venda real, definir no mínimo:

1. backup diário do arquivo SQLite com o processo parado ou snapshot consistente;
2. cópia em armazenamento separado da máquina principal;
3. retenção mínima, por exemplo 30 dias;
4. backup antes de cada deploy/migração;
5. teste mensal de restauração;
6. monitoramento de falhas do backup;
7. proteção dos backups por criptografia e controle de acesso.

## 11. Indisponibilidade do Mercado Pago
O código trata respostas HTTP não-2xx e devolve erro sem expor o token. Isso é
positivo.

Ainda faltam para produção:

- timeout explícito nas chamadas server-side ao Mercado Pago;
- retry com backoff apenas para erros transitórios;
- não repetir automaticamente criação de preferência sem idempotency key;
- fila/reprocessamento para webhook temporariamente indisponível;
- alerta operacional;
- reconciliação periódica de pedidos aguardando pagamento.

Um timeout sem retry é preferível a bloquear indefinidamente, mas não é ainda
uma operação de pagamento resiliente.

## 12. Páginas legais e dados obrigatórios
Não foram encontradas páginas completas para:

- Política de Privacidade/LGPD;
- Termos de Uso;
- Política de Trocas e Devoluções;
- Política de Entrega e Frete;
- contato e canal de atendimento;
- identificação comercial, razão social/CNPJ quando aplicável;
- informação clara sobre prazo de entrega e produção pela YouDraw.

Também falta definir:

- base legal e prazo de retenção de nome, CPF, telefone, e-mail e endereço;
- procedimento de solicitação/exclusão de dados;
- responsável pelo tratamento;
- emissão fiscal;
- regras de cancelamento, reembolso e chargeback;
- consentimento/uso de newsletter, caso exista.

Sem isso, a loja não deve iniciar venda pública.

## 13. Checklist para a primeira venda real
### Hospedagem
- [ ] Escolher Railway com Volume ou Render com Persistent Disk.
- [ ] Confirmar por escrito o caminho persistente do volume.
- [ ] Configurar `GRACIOU_DB` dentro do volume.
- [ ] Manter uma única instância do backend enquanto usar SQLite.
- [ ] Desativar autoscaling horizontal.
- [ ] Configurar domínio próprio e HTTPS.
- [ ] Testar restart e deploy sem perder um pedido de teste.

### Banco e operação
- [ ] Criar backup automático.
- [ ] Fazer restauração de teste.
- [ ] Definir retenção de backups.
- [ ] Monitorar espaço em disco, saúde da API e erros.
- [ ] Documentar procedimento de recuperação.

### Mercado Pago
- [ ] Criar/usar credenciais de teste.
- [ ] Configurar `MP_ACCESS_TOKEN` no secret manager da hospedagem.
- [ ] Configurar `MP_WEBHOOK_SECRET`.
- [ ] Configurar `PUBLIC_BASE_URL=https://...` público.
- [ ] Confirmar `notification_url` alcançável externamente.
- [ ] Testar aprovado, pendente, rejeitado e repetição de webhook.
- [ ] Confirmar o pagamento consultando a API, nunca pelo redirect.
- [ ] Configurar credenciais de produção somente após homologação.

### Frontend e CORS
- [ ] Trocar origens locais por domínio oficial no CORS de produção.
- [ ] Remover `Origin: null` em produção.
- [ ] Configurar frontend para a URL HTTPS real da API.
- [ ] Testar checkout no domínio final.
- [ ] Testar retorno success/failure/pending.

### Segurança
- [ ] Revisar histórico Git em busca de segredos.
- [ ] Ativar rate limiting do login.
- [ ] Usar senha admin forte e exclusiva.
- [ ] Considerar MFA ou VPN para o painel.
- [ ] Confirmar que logs do provedor não exibem Authorization.
- [ ] Validar headers HTTPS, CSP, HSTS e cookies conforme a arquitetura final.

### Legal e comercial
- [ ] Publicar Termos de Uso.
- [ ] Publicar Política de Privacidade/LGPD.
- [ ] Publicar Trocas e Devoluções.
- [ ] Publicar Entrega/Frete.
- [ ] Definir atendimento, prazos e identificação comercial.
- [ ] Definir emissão fiscal.
- [ ] Confirmar preços, SKUs, estoque e imagens reais da YouDraw.

### Homologação final
- [ ] Criar pedido de teste com cada grupo de frete.
- [ ] Confirmar que o cupom não reduz frete.
- [ ] Confirmar que o navegador não consegue adulterar total/frete.
- [ ] Confirmar que o admin exige login.
- [ ] Confirmar backup e restauração.
- [ ] Confirmar webhook em domínio HTTPS.
- [ ] Só depois trocar credenciais para produção.

## 14. Conclusão
### SQLite pode permanecer?

**Pode permanecer apenas na primeira versão, com uma única instância, volume
persistente e backup externo testado.** Não deve ser usado em arquitetura com
múltiplas réplicas ou filesystem efêmero.

### Recomendação
Usar **Railway + Volume persistente** ou **Render + Persistent Disk** para uma
primeira operação pequena. A escolha final deve ser feita somente depois de
confirmar preço, região, backups, HTTPS, volume e procedimento de restauração.

Para uma operação comercial contínua, recomendo planejar PostgreSQL gerenciado
antes de crescimento ou escala horizontal.

**Resultado final:** o software está tecnicamente avançado, mas a operação ainda
não está pronta para a primeira venda real. Não publicar até fechar os itens
marcados como riscos altos e concluir a homologação com credenciais de teste.

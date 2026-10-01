/**
 * ═══════════════════════════════════════
 * GRACIOU — AUTENTICAÇÃO E OPERAÇÃO ADMINISTRATIVA
 * Arquivo: backend/admin.js
 * ═══════════════════════════════════════
 *
 * ─── O QUE ESTE ARQUIVO FAZ ─────────────────────────────────
 *   - lê as credenciais SOMENTE de variáveis de ambiente
 *     (ADMIN_EMAIL / ADMIN_PASSWORD) — nunca do código, nunca do
 *     banco e nunca do frontend;
 *   - emite um token de sessão temporário, aleatório e opaco;
 *   - guarda as sessões apenas em MEMÓRIA (reiniciar a API derruba
 *     todas — comportamento desejado para um painel local);
 *   - valida e normaliza o que o painel pode alterar num pedido.
 *
 * ─── O QUE ESTE ARQUIVO NÃO FAZ (de propósito) ──────────────
 *   - não grava senha em lugar nenhum (não existe tabela de usuário);
 *   - não cria sessão permanente nem "lembrar-me";
 *   - não imprime credencial, token nem dado pessoal no console.
 *
 * ─── SOBRE A SENHA ──────────────────────────────────────────
 * A senha vive na variável de ambiente ADMIN_PASSWORD e é comparada
 * em memória com timingSafeEqual. Ela NUNCA é persistida: o banco
 * SQLite deste painel guarda apenas pedidos e cupons — não há
 * coluna, tabela nem hash de senha. Ou seja, "senha em texto no
 * banco" é impossível por construção, não por convenção.
 */

'use strict';

const crypto = require('node:crypto');

/* ─────────────────────────────────────────────
   STATUS PERMITIDOS DO PEDIDO
   Lista única do projeto. O painel monta o <select> a partir dela
   (GET /api/admin/orders devolve em `meta.statusPermitidos`) e o
   servidor recusa qualquer valor fora dela.
   ───────────────────────────────────────────── */
const STATUS_PERMITIDOS = [
  'aguardando_pagamento',
  'pago',
  'encomendar_na_youdraw',
  'pedido_na_youdraw',
  'em_producao',
  'enviado',
  'entregue',
  'cancelado'
];

/* Rótulos de exibição. Ficam no servidor para que painel e API
   mostrem a mesma palavra — e para o resumo da YouDraw sair pronto. */
const ROTULOS_STATUS = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  encomendar_na_youdraw: 'Encomendar na YouDraw',
  pedido_na_youdraw: 'Pedido na YouDraw',
  em_producao: 'Em produção',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado'
};

/** Status de pagamento que o painel pode gravar (não existe 'estornado' etc.). */
const STATUS_PAGAMENTO_PERMITIDOS = ['aguardando', 'pago', 'recusado', 'cancelado'];

const TAMANHO_MAX_OBSERVACAO = 2000;
const TAMANHO_MAX_RASTREIO = 120;
const TAMANHO_MAX_YOUDRAW = 120;

/* ─────────────────────────────────────────────
   CREDENCIAL (variáveis de ambiente)
   ───────────────────────────────────────────── */

/**
 * Lê as credenciais do ambiente.
 * Devolve null quando não estão configuradas — nesse caso o
 * servidor NÃO expõe o login, em vez de aceitar qualquer senha.
 */
function credenciaisDoAmbiente() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const senha = String(process.env.ADMIN_PASSWORD || '');

  if (!email || !senha) return null;
  return { email: email, senha: senha };
}

/** O painel administrativo está configurado? */
function configurado() {
  return credenciaisDoAmbiente() !== null;
}

/**
 * Compara duas strings sem vazar informação pelo tempo de resposta.
 * O hash SHA-256 prévio garante buffers do mesmo tamanho, então
 * timingSafeEqual pode ser usado mesmo com entradas de tamanhos
 * diferentes (e-mail curto vs. senha longa, por exemplo).
 */
function iguaisEmTempoConstante(a, b) {
  const hash = (v) => crypto.createHash('sha256').update(String(v), 'utf8').digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

/**
 * Confere e-mail + senha contra o ambiente.
 * Devolve { ok: true } ou { ok: false, erro: '...' }.
 * A mensagem de erro é a MESMA para e-mail inexistente e senha
 * errada: o painel não revela qual das duas falhou.
 */
function conferirCredenciais(email, senha) {
  const credenciais = credenciaisDoAmbiente();

  if (!credenciais) {
    return {
      ok: false,
      motivo: 'nao_configurado',
      erro: 'Painel administrativo não configurado. Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente da API.'
    };
  }

  const emailInformado = String(email || '').trim().toLowerCase();
  const senhaInformada = String(senha || '');

  const emailOk = iguaisEmTempoConstante(emailInformado, credenciais.email);
  const senhaOk = iguaisEmTempoConstante(senhaInformada, credenciais.senha);

  /* As duas comparações rodam sempre: nada de curto-circuito que
     denuncie qual campo estava errado. */
  if (emailOk && senhaOk) return { ok: true };

  return { ok: false, motivo: 'credencial', erro: 'E-mail ou senha inválidos.' };
}

/* ─────────────────────────────────────────────
   SESSÕES (somente em memória)
   ───────────────────────────────────────────── */

const DURACAO_SESSAO_MS = 30 * 60 * 1000; /* 30 minutos */

/* token -> { email, criadaEm, expiraEm } */
const sessoes = new Map();

function agoraMs() {
  return Date.now();
}

/** Remove sessões expiradas. Chamada a cada uso para o mapa não crescer. */
function limparExpiradas() {
  const agora = agoraMs();
  for (const [token, sessao] of sessoes) {
    if (sessao.expiraEm <= agora) sessoes.delete(token);
  }
}

/**
 * Cria uma sessão e devolve o token opaco (32 bytes em hex).
 * O token é aleatório (crypto.randomBytes) — não é derivado do
 * e-mail, da senha nem da hora, então não vaza nada.
 */
function criarSessao(email) {
  limparExpiradas();

  const token = crypto.randomBytes(32).toString('hex');
  const criadaEm = agoraMs();

  sessoes.set(token, {
    email: email,
    criadaEm: criadaEm,
    expiraEm: criadaEm + DURACAO_SESSAO_MS
  });

  return {
    token: token,
    expiraEm: new Date(criadaEm + DURACAO_SESSAO_MS).toISOString(),
    duracaoSegundos: Math.floor(DURACAO_SESSAO_MS / 1000)
  };
}

/** Devolve a sessão válida do token, ou null. Renova nada (expira no prazo). */
function obterSessao(token) {
  limparExpiradas();
  if (!token) return null;

  const sessao = sessoes.get(String(token));
  if (!sessao) return null;
  if (sessao.expiraEm <= agoraMs()) {
    sessoes.delete(String(token));
    return null;
  }
  return sessao;
}

/** Derruba a sessão. Devolve true se havia algo para derrubar. */
function encerrarSessao(token) {
  if (!token) return false;
  return sessoes.delete(String(token));
}

/** Útil para diagnóstico no /api/health — nunca devolve o token. */
function sessoesAtivas() {
  limparExpiradas();
  return sessoes.size;
}

/** Encerra todas as sessões (usado nos testes). */
function encerrarTodas() {
  const n = sessoes.size;
  sessoes.clear();
  return n;
}

/**
 * Extrai o token do header Authorization: Bearer <token>.
 * Só isso: cookie, query string ou corpo não são aceitos — assim o
 * token não vaza em histórico, log de proxy ou referrer.
 */
function tokenDaRequisicao(req) {
  const cabecalho = req && req.headers ? req.headers.authorization : '';
  if (!cabecalho) return null;

  const partes = String(cabecalho).trim().split(/\s+/);
  if (partes.length !== 2) return null;
  if (partes[0].toLowerCase() !== 'bearer') return null;
  if (!partes[1]) return null;

  return partes[1];
}

/* ─────────────────────────────────────────────
   VALIDAÇÃO DO QUE O PAINEL PODE ALTERAR
   ───────────────────────────────────────────── */

const texto = (v) => String(v === null || v === undefined ? '' : v).trim();

/**
 * Verifica se a string tem caracteres de controle (que quebrariam
 * log, print ou o resumo colado na YouDraw).
 */
function temCaractereDeControle(valor) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(valor);
}

/**
 * Valida o corpo do PATCH /api/admin/orders/:id.
 *
 * REGRA IMPORTANTE: só entram no UPDATE os campos realmente
 * enviados. Campo ausente é campo que não se toca — é isso que
 * garante o requisito "atualizar sem apagar dados existentes".
 *
 * `observacoes` tem dois modos:
 *   - modo "adicionar" (padrão): a linha nova é acrescentada ao
 *     final do que já existe;
 *   - modo "substituir": troca o texto inteiro.
 */
function validarAtualizacao(corpo) {
  const erros = [];

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return { ok: false, erros: [{ campo: 'corpo', mensagem: 'Corpo JSON inválido.' }] };
  }

  const alteracoes = {};
  const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);

  /* ── statusPedido ── */
  if (tem('statusPedido')) {
    const status = texto(corpo.statusPedido);
    if (STATUS_PERMITIDOS.indexOf(status) === -1) {
      erros.push({
        campo: 'statusPedido',
        mensagem: 'Status inválido. Permitidos: ' + STATUS_PERMITIDOS.join(', ') + '.'
      });
    } else {
      alteracoes.statusPedido = status;
    }
  }

  /* ── rastreio ── */
  if (tem('rastreio')) {
    const rastreio = texto(corpo.rastreio);
    if (temCaractereDeControle(rastreio)) {
      erros.push({ campo: 'rastreio', mensagem: 'O código de rastreio tem caracteres inválidos.' });
    } else if (rastreio.length > TAMANHO_MAX_RASTREIO) {
      erros.push({ campo: 'rastreio', mensagem: 'Código de rastreio muito longo (máx. ' + TAMANHO_MAX_RASTREIO + ').' });
    } else {
      /* Vazio é permitido: significa "ainda não há rastreio". */
      alteracoes.rastreio = rastreio || null;
    }
  }

  /* ── pedidoYouDraw ── */
  if (tem('pedidoYouDraw')) {
    const numero = texto(corpo.pedidoYouDraw);
    if (temCaractereDeControle(numero)) {
      erros.push({ campo: 'pedidoYouDraw', mensagem: 'O número da YouDraw tem caracteres inválidos.' });
    } else if (numero.length > TAMANHO_MAX_YOUDRAW) {
      erros.push({ campo: 'pedidoYouDraw', mensagem: 'Número da YouDraw muito longo (máx. ' + TAMANHO_MAX_YOUDRAW + ').' });
    } else {
      alteracoes.pedidoYouDraw = numero || null;
    }
  }

  /* ── statusPagamento (opcional: permite marcar "pago" sem Mercado Pago) ── */
  if (tem('statusPagamento')) {
    const status = texto(corpo.statusPagamento);
    if (STATUS_PAGAMENTO_PERMITIDOS.indexOf(status) === -1) {
      erros.push({
        campo: 'statusPagamento',
        mensagem: 'Status de pagamento inválido. Permitidos: ' + STATUS_PAGAMENTO_PERMITIDOS.join(', ') + '.'
      });
    } else {
      alteracoes.statusPagamento = status;
    }
  }

  /* ── observacoes (adiciona ou substitui) ── */
  if (tem('observacoes')) {
    const observacao = texto(corpo.observacoes);
    if (temCaractereDeControle(observacao)) {
      erros.push({ campo: 'observacoes', mensagem: 'A observação tem caracteres inválidos.' });
    } else {
      alteracoes.observacoes = observacao;
      alteracoes.observacoesModo = texto(corpo.observacoesModo) === 'substituir'
        ? 'substituir'
        : 'adicionar';
    }
  }

  if (erros.length) return { ok: false, erros: erros };

  if (!Object.keys(alteracoes).length) {
    return {
      ok: false,
      erros: [{
        campo: 'corpo',
        mensagem: 'Nada para atualizar. Envie ao menos um de: statusPedido, statusPagamento, rastreio, pedidoYouDraw, observacoes.'
      }]
    };
  }

  return { ok: true, alteracoes: alteracoes };
}

/* ─────────────────────────────────────────────
   RESUMO PARA A YOUDRAW
   Texto puro, pronto para colar. Sem HTML, sem emoji, sem acento
   problemático — só o que a produção precisa saber.
   ───────────────────────────────────────────── */

const moeda = (centavos) => {
  if (centavos === null || centavos === undefined) return 'a calcular';
  return 'R$ ' + (Number(centavos) / 100).toFixed(2).replace('.', ',');
};

const semAcento = (texto) => String(texto || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

/**
 * Monta o resumo do pedido para colar na YouDraw.
 * É a fonte única desse texto: o painel só copia o que vier daqui.
 */
function resumoParaYouDraw(pedido) {
  if (!pedido) return '';

  const linhas = [];
  const cliente = pedido.cliente || {};
  const endereco = pedido.endereco || {};
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];

  linhas.push('PEDIDO ' + pedido.id);
  linhas.push('Data: ' + String(pedido.criadoEm || '').replace('T', ' ').slice(0, 19));
  linhas.push('Status: ' + (ROTULOS_STATUS[pedido.statusPedido] || pedido.statusPedido || '-'));
  if (pedido.pedidoYouDraw) linhas.push('Pedido YouDraw: ' + pedido.pedidoYouDraw);
  linhas.push('');

  linhas.push('CLIENTE');
  linhas.push('Nome: ' + (cliente.nome || '-'));
  linhas.push('E-mail: ' + (cliente.email || '-'));
  linhas.push('Telefone: ' + (cliente.telefone || '-'));
  linhas.push('');

  linhas.push('ENTREGA');
  linhas.push(
    (endereco.rua || '-') + ', ' + (endereco.numero || '-') +
    (endereco.complemento ? ' - ' + endereco.complemento : '')
  );
  linhas.push((endereco.bairro || '-') + ' - ' + (endereco.cidade || '-') + '/' + (endereco.estado || '-'));
  linhas.push('CEP: ' + (endereco.cep || '-'));
  linhas.push('');

  linhas.push('ITENS');
  itens.forEach((item, indice) => {
    linhas.push(
      (indice + 1) + '. ' + semAcento(item.nome || item.productId || '-') +
      ' | Tam: ' + (item.tamanho || '-') +
      ' | Cor: ' + (item.cor || '-') +
      ' | Qtd: ' + (item.quantidade || 0)
    );
  });
  linhas.push('');

  linhas.push('PAGAMENTO');
  linhas.push('Forma: ' + (pedido.pagamento && pedido.pagamento.forma === 'cartao' ? 'Cartao' : 'Pix'));
  linhas.push('Status: ' + ((pedido.pagamento && pedido.pagamento.status) || '-'));
  linhas.push('Subtotal: ' + moeda(pedido.subtotal));
  linhas.push('Desconto: ' + moeda(pedido.desconto || 0));
  linhas.push('Cupom: ' + ((pedido.cupom && pedido.cupom.codigo) || 'sem cupom'));
  linhas.push('Frete: ' + moeda(pedido.frete));
  linhas.push('Total: ' + moeda(pedido.total));

  if (pedido.rastreio) {
    linhas.push('');
    linhas.push('RASTREIO: ' + pedido.rastreio);
  }

  if (pedido.observacoes) {
    linhas.push('');
    linhas.push('OBSERVACOES');
    linhas.push(semAcento(pedido.observacoes));
  }

  return linhas.join('\n');
}

module.exports = {
  STATUS_PERMITIDOS: STATUS_PERMITIDOS,
  ROTULOS_STATUS: ROTULOS_STATUS,
  STATUS_PAGAMENTO_PERMITIDOS: STATUS_PAGAMENTO_PERMITIDOS,
  DURACAO_SESSAO_MS: DURACAO_SESSAO_MS,

  configurado: configurado,
  conferirCredenciais: conferirCredenciais,

  criarSessao: criarSessao,
  obterSessao: obterSessao,
  encerrarSessao: encerrarSessao,
  encerrarTodas: encerrarTodas,
  sessoesAtivas: sessoesAtivas,
  tokenDaRequisicao: tokenDaRequisicao,

  validarAtualizacao: validarAtualizacao,
  resumoParaYouDraw: resumoParaYouDraw
};
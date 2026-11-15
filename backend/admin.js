/**
 * ═══════════════════════════════════════
 * GRACIOU — AUTENTICAÇÃO E OPERAÇÃO ADMINISTRATIVA
 * Arquivo: backend/admin.js
 * ═══════════════════════════════════════
 *
 * ─── O QUE ESTE ARQUIVO FAZ ─────────────────────────────────
 *   - lê as credenciais SOMENTE de variáveis de ambiente
 *     (ADMIN_TOTP_SECRET) — nunca do código, nunca do
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
 * O primeiro fator (usuário + senha) é validado pelo proxy da Vercel.
 * Esta API valida o segundo fator TOTP e não persiste credencial alguma:
 * o banco guarda apenas pedidos e cupons.
 */

'use strict';

const crypto = require('node:crypto');
const acompanhamento = require('./acompanhamento');

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
const TAMANHO_MAX_TRANSPORTADORA = 80;
const TAMANHO_MAX_URL = 500;
const TAMANHO_MAX_OBSERVACAO_PUBLICA = 1000;

/* ─────────────────────────────────────────────
   CREDENCIAL (variáveis de ambiente)
   ───────────────────────────────────────────── */

/**
 * Lê as credenciais do ambiente.
 * Devolve null quando não estão configuradas — nesse caso o
 * servidor NÃO expõe o login, em vez de aceitar qualquer senha.
 */
function credenciaisDoAmbiente() {
  const segredoTotp = String(process.env.ADMIN_TOTP_SECRET || '')
    .replace(/[\s-]+/g, '')
    .toUpperCase();

  if (!segredoTotp || !/^[A-Z2-7]{16,}$/.test(segredoTotp)) return null;
  return { segredoTotp: segredoTotp };
}

/** O painel administrativo está configurado? */
function configurado() {
  return credenciaisDoAmbiente() !== null;
}

/**
 * Compara duas strings sem vazar informação pelo tempo de resposta.
 * O hash SHA-256 prévio garante buffers do mesmo tamanho, então
 * timingSafeEqual pode ser usado mesmo com entradas de tamanhos
 * diferentes sem vazar o conteúdo comparado.
 */
function iguaisEmTempoConstante(a, b) {
  const hash = (v) => crypto.createHash('sha256').update(String(v), 'utf8').digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

/**
 * Confere o código TOTP contra o segredo do ambiente.
 * Devolve { ok: true } ou { ok: false, erro: '...' }.
 * A mensagem de erro não revela detalhes sobre o segredo configurado.
 */
function base32ParaBuffer(valor) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const caractere of String(valor || '')) {
    const indice = alfabeto.indexOf(caractere);
    if (indice < 0) return null;
    bits += indice.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return bytes.length >= 10 ? Buffer.from(bytes) : null;
}

function codigoTotp(segredoBase32, passo) {
  const chave = base32ParaBuffer(segredoBase32);
  if (!chave) return null;

  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hash = crypto.createHmac('sha1', chave).update(contador).digest();
  const deslocamento = hash[hash.length - 1] & 0x0f;
  const numero = (hash.readUInt32BE(deslocamento) & 0x7fffffff) % 1000000;
  return String(numero).padStart(6, '0');
}

function conferirTotp(codigo, segredoBase32, agora = Date.now()) {
  const informado = String(codigo || '').replace(/\s+/g, '');
  const formatoValido = /^\d{6}$/.test(informado);
  const passoAtual = Math.floor(Number(agora) / 30000);
  let valido = false;

  /* Sempre calcula os três intervalos para não revelar o acerto pelo tempo. */
  for (const desvio of [-1, 0, 1]) {
    const esperado = codigoTotp(segredoBase32, passoAtual + desvio) || '000000';
    const candidato = formatoValido ? informado : '999999';
    valido = iguaisEmTempoConstante(candidato, esperado) || valido;
  }
  return formatoValido && valido;
}

function conferirCredenciais(codigo) {
  const credenciais = credenciaisDoAmbiente();

  if (!credenciais) {
    return {
      ok: false,
      motivo: 'nao_configurado',
      erro: 'Painel administrativo não configurado. Defina ADMIN_TOTP_SECRET no ambiente da API.'
    };
  }

  const totpOk = conferirTotp(codigo, credenciais.segredoTotp);

  if (totpOk) return { ok: true };

  return { ok: false, motivo: 'credencial', erro: 'Código temporário inválido.' };
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
 * identificador nem da hora, então não vaza nada.
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

  /* ── transportadora ── */
  if (tem('transportadora')) {
    const transportadora = texto(corpo.transportadora);
    if (temCaractereDeControle(transportadora)) {
      erros.push({ campo: 'transportadora', mensagem: 'A transportadora tem caracteres inválidos.' });
    } else if (transportadora.length > TAMANHO_MAX_TRANSPORTADORA) {
      erros.push({ campo: 'transportadora', mensagem: 'Nome da transportadora muito longo (máx. ' + TAMANHO_MAX_TRANSPORTADORA + ').' });
    } else {
      alteracoes.transportadora = transportadora || null;
    }
  }

  /* ── rastreioUrl — SOMENTE HTTPS ──
     Vazio limpa o campo; qualquer valor que não seja https:// é recusado
     (bloqueia http, javascript:, data: e afins). */
  if (tem('rastreioUrl')) {
    const bruto = texto(corpo.rastreioUrl);
    if (!bruto) {
      alteracoes.rastreioUrl = null;
    } else {
      const url = acompanhamento.urlHttpsValida(bruto);
      if (!url) {
        erros.push({ campo: 'rastreioUrl', mensagem: 'O link de rastreio precisa ser uma URL HTTPS válida (https://…).' });
      } else if (url.length > TAMANHO_MAX_URL) {
        erros.push({ campo: 'rastreioUrl', mensagem: 'Link de rastreio muito longo (máx. ' + TAMANHO_MAX_URL + ').' });
      } else {
        alteracoes.rastreioUrl = url;
      }
    }
  }

  /* ── observacaoPublica (o cliente vê na consulta; ≠ observacoes) ── */
  if (tem('observacaoPublica')) {
    const observacao = texto(corpo.observacaoPublica);
    if (temCaractereDeControle(observacao)) {
      erros.push({ campo: 'observacaoPublica', mensagem: 'A observação pública tem caracteres inválidos.' });
    } else if (observacao.length > TAMANHO_MAX_OBSERVACAO_PUBLICA) {
      erros.push({ campo: 'observacaoPublica', mensagem: 'Observação pública muito longa (máx. ' + TAMANHO_MAX_OBSERVACAO_PUBLICA + ').' });
    } else {
      alteracoes.observacaoPublica = observacao || null;
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
        mensagem: 'Nada para atualizar. Envie ao menos um de: statusPedido, statusPagamento, rastreio, transportadora, rastreioUrl, pedidoYouDraw, observacaoPublica, observacoes.'
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
  conferirTotp: conferirTotp,
  codigoTotp: codigoTotp,

  criarSessao: criarSessao,
  obterSessao: obterSessao,
  encerrarSessao: encerrarSessao,
  encerrarTodas: encerrarTodas,
  sessoesAtivas: sessoesAtivas,
  tokenDaRequisicao: tokenDaRequisicao,

  validarAtualizacao: validarAtualizacao,
  resumoParaYouDraw: resumoParaYouDraw
};

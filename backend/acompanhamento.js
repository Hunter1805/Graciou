/**
 * ═══════════════════════════════════════
 * GRACIOU — ACOMPANHAMENTO DE PEDIDO
 * Arquivo: backend/acompanhamento.js
 * ═══════════════════════════════════════
 *
 * Concentra TUDO o que a consulta pública do cliente precisa, para que
 * essa camada — a única que responde sem sessão — seja pequena, testável
 * e fácil de auditar:
 *
 *   1. a montagem da resposta pública (sem CPF, endereço completo, notas
 *      internas, ids de pagamento ou telefone);
 *   2. a linha do tempo a partir do histórico REAL (order_events) — nunca
 *      inferida do status atual;
 *   3. o limite de tentativas por IP (evita varredura de números/e-mails);
 *   4. a validação do link da transportadora (SOMENTE HTTPS).
 *
 * Nada aqui fala direto com o banco: o módulo recebe o pedido e o
 * histórico já carregados pelo chamador (servidor.js), o que deixa a
 * lógica pura e coberta pelos testes sem subir rede.
 */

'use strict';

/* ─────────────────────────────────────────────
   STATUS → ETAPA DA LINHA DO TEMPO
   Reaproveita os status oficiais de admin.js. O cancelamento é tratado
   FORA da linha do tempo normal (ver `respostaPublica`).
   ───────────────────────────────────────────── */
const ETAPAS = [
  { chave: 'recebido', rotulo: 'Pedido recebido' },
  { chave: 'pago', rotulo: 'Pagamento confirmado' },
  { chave: 'em_preparacao', rotulo: 'Em preparação' },
  { chave: 'enviado', rotulo: 'Enviado' },
  { chave: 'entregue', rotulo: 'Entregue' }
];

/* Cada status oficial mapeia para UMA etapa da timeline. Status
   intermediários da produção (YouDraw) contam como "Em preparação". */
const ETAPA_POR_STATUS = {
  aguardando_pagamento: 'recebido',
  pago: 'pago',
  encomendar_na_youdraw: 'em_preparacao',
  pedido_na_youdraw: 'em_preparacao',
  em_producao: 'em_preparacao',
  enviado: 'enviado',
  entregue: 'entregue'
};

const STATUS_CANCELADO = 'cancelado';

const texto = (valor) => String(valor === null || valor === undefined ? '' : valor).trim();

/* ─────────────────────────────────────────────
   VALIDAÇÃO DO LINK DA TRANSPORTADORA
   Só HTTPS é aceito: evita link http://, javascript:, data: e afins.
   Devolve a URL normalizada ou null (nunca lança).
   ───────────────────────────────────────────── */
function urlHttpsValida(bruto) {
  const valor = texto(bruto);
  if (!valor) return null;
  if (valor.length > 500) return null;
  let url;
  try {
    url = new URL(valor);
  } catch (_) {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  return url.toString();
}

/* ─────────────────────────────────────────────
   RESPOSTA PÚBLICA
   Mostra apenas o necessário para acompanhar. O que NÃO sai daqui:
   CPF, telefone, e-mail (de volta), endereço completo, notas internas,
   ids do Mercado Pago e os campos de controle de e-mail.
   ───────────────────────────────────────────── */
function respostaPublica(pedido, eventos) {
  if (!pedido) return null;

  const status = pedido.statusPedido;
  const cancelado = status === STATUS_CANCELADO;
  const eventosSeguros = Array.isArray(eventos) ? eventos : [];

  return {
    numero: pedido.id,
    criadoEm: pedido.criadoEm,
    atualizadoEm: pedido.atualizadoEm || null,
    status: status,
    cancelado: cancelado,
    /* Entrega enxuta: só cidade/UF do destino, jamais o endereço completo. */
    destino: {
      cidade: (pedido.endereco && pedido.endereco.cidade) || null,
      estado: (pedido.endereco && pedido.endereco.estado) || null
    },
    /* Observação PÚBLICA (não a interna). */
    observacaoPublica: pedido.observacaoPublica || null,
    rastreio: {
      transportadora: pedido.transportadora || null,
      codigo: pedido.rastreio || null,
      url: urlHttpsValida(pedido.rastreioUrl),
      disponivel: Boolean(pedido.rastreio)
    },
    linhaDoTempo: montarLinhaDoTempo(status, eventosSeguros)
  };
}

/**
 * Monta a linha do tempo. Regra central do requisito:
 * "Exibir somente datas e etapas realmente registradas."
 *
 * A etapa só recebe data se existir um EVENTO real no histórico para
 * ela. Se o status atual indica uma etapa sem evento correspondente
 * (por exemplo, um pedido antigo, anterior a este recurso), a etapa
 * aparece como atual mas SEM data — nunca inventamos horário.
 */
function montarLinhaDoTempo(statusAtual, eventos) {
  const etapaAtual = ETAPA_POR_STATUS[statusAtual] || null;

  /* Primeira ocorrência (por tempo) de cada etapa no histórico. */
  const registradas = {};
  eventos.forEach((evento) => {
    if (evento.publico === false) return;
    const etapa = evento.status ? ETAPA_POR_STATUS[evento.status] : null;
    if (!etapa) return;
    if (!registradas[etapa]) registradas[etapa] = evento.criadoEm || null;
  });

  const concluidas = novos =>
    ETAPAS.map((etapa, indice) => {
      const data = registradas[etapa.chave] || null;
      const registro = Boolean(registradas[etapa.chave]);
      const atual = etapa.chave === etapaAtual;
      return {
        chave: etapa.chave,
        rotulo: etapa.rotulo,
        data: data,
        /* `true` = existe data real registrada. */
        registrada: registro,
        /* `true` = é a etapa em que o pedido está agora. */
        atual: atual,
        /* Concluída de fato = tem data; a etapa atual sem data continua
           marcada como atual, mas não como concluída. */
        concluida: registro
      };
    });

  return concluidas();
}

/**
 * Mantém apenas eventos que fazem sentido mostrar ao cliente na
 * timeline (etapas oficiais, públicos). Eventos internos e textos
 * livres de observação não entram aqui.
 */
function eventosDaTimeline(eventos) {
  return (Array.isArray(eventos) ? eventos : [])
    .filter((evento) => evento.publico !== false)
    .filter((evento) => !evento.status || ETAPA_POR_STATUS[evento.status])
    .sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')));
}

/* ─────────────────────────────────────────────
   LIMITE DE TENTATIVAS (por IP)
   Simples janela deslizante em memória. Sem dependência externa — e a
   mesma instância atende dev local e Vercel (uma função por região).
   ───────────────────────────────────────────── */
const JANELA_MS = 10 * 60 * 1000; /* 10 minutos */
const MAX_TENTATIVAS = 10;

const tentativas = new Map(); /* ip -> [timestamps] */

function limparAntigas(agora, marcas) {
  const limite = agora - JANELA_MS;
  return marcas.filter((t) => t > limite);
}

/**
 * Registra uma tentativa e diz se ainda é permitida.
 * @returns {{permitido:boolean, restantes:number}}
 */
function registrarTentativa(ip, agoraMs) {
  const agora = agoraMs || Date.now();
  const chave = String(ip || 'desconhecido');

  let marcas = limparAntigas(agora, tentativas.get(chave) || []);
  const permitido = marcas.length < MAX_TENTATIVAS;
  marcas.push(agora);
  tentativas.set(chave, marcas);

  /* Higiene: não deixa o mapa crescer sem limite. */
  if (tentativas.size > 5000) {
    for (const [chaveAntiga, lista] of tentativas) {
      const restante = limparAntigas(agora, lista);
      if (restante.length) tentativas.set(chaveAntiga, restante);
      else tentativas.delete(chaveAntiga);
    }
  }

  return { permitido: permitido, restantes: Math.max(0, MAX_TENTATIVAS - marcas.length) };
}

/** Limpa o estado do limitador (usado nos testes). */
function limparTentativas() {
  tentativas.clear();
}

/* ─────────────────────────────────────────────
   NORMALIZAÇÃO DA ENTRADA
   ───────────────────────────────────────────── */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/** Valida número + e-mail recebidos. Devolve { ok, erros } ou os valores. */
function validarConsulta(corpo) {
  const bruto = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  const numero = texto(bruto.numero || bruto.pedido || bruto.id);
  const email = texto(bruto.email).toLowerCase();

  const erros = [];
  if (!numero) erros.push({ campo: 'numero', mensagem: 'Informe o número do pedido.' });
  if (!email) {
    erros.push({ campo: 'email', mensagem: 'Informe o e-mail usado na compra.' });
  } else if (!RE_EMAIL.test(email)) {
    erros.push({ campo: 'email', mensagem: 'E-mail inválido.' });
  }

  if (erros.length) return { ok: false, erros: erros };
  return { ok: true, numero: numero, email: email };
}

/* ─────────────────────────────────────────────
   EVENTOS PARA O ADMIN
   Monta o registro de histórico a partir de uma atualização do painel.
   Um evento por campo alterado que importa para o cliente, com data/hora
   e um texto legível. Tudo público por padrão — o que é interno vive em
   `observacoes`, e `observacaoPublica` também é registrada como evento.
   ───────────────────────────────────────────── */
function eventosDaAtualizacao(alteracoes, rotulosStatus, momento) {
  const a = alteracoes || {};
  const evento = [];
  const quando = momento || new Date().toISOString();

  if (a.statusPedido !== undefined) {
    const status = a.statusPedido;
    evento.push({
      tipo: 'status',
      status: status,
      titulo: (rotulosStatus && rotulosStatus[status]) || status,
      publico: true,
      criadoEm: quando
    });
  }

  if (a.rastreio !== undefined && a.rastreio) {
    evento.push({
      tipo: 'rastreio',
      status: a.statusPedido || null,
      titulo: 'Código de rastreio informado',
      descricao: a.rastreio,
      publico: true,
      criadoEm: quando
    });
  }

  if (a.observacaoPublica !== undefined && a.observacaoPublica) {
    evento.push({
      tipo: 'observacao_publica',
      status: null,
      titulo: 'Atualização do pedido',
      descricao: a.observacaoPublica,
      publico: true,
      criadoEm: quando
    });
  }

  return evento;
}

/** Evento de criação do pedido (primeira etapa da timeline). */
function eventoDeCriacao(pedido, quando) {
  return {
    tipo: 'status',
    status: 'aguardando_pagamento',
    titulo: 'Pedido recebido',
    publico: true,
    criadoEm: quando || pedido.criadoEm || new Date().toISOString()
  };
}

module.exports = {
  ETAPAS: ETAPAS,
  ETAPA_POR_STATUS: ETAPA_POR_STATUS,
  STATUS_CANCELADO: STATUS_CANCELADO,
  MAX_TENTATIVAS: MAX_TENTATIVAS,
  JANELA_MS: JANELA_MS,

  urlHttpsValida: urlHttpsValida,
  respostaPublica: respostaPublica,
  montarLinhaDoTempo: montarLinhaDoTempo,
  eventosDaTimeline: eventosDaTimeline,
  registrarTentativa: registrarTentativa,
  limparTentativas: limparTentativas,
  validarConsulta: validarConsulta,
  eventosDaAtualizacao: eventosDaAtualizacao,
  eventoDeCriacao: eventoDeCriacao
};

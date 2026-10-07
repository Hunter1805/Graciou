/**
 * ═══════════════════════════════════════
 * GRACIOU — E-MAIL TRANSACIONAL (BREVO)
 * Arquivo: backend/email.js
 * ═══════════════════════════════════════
 *
 * Usa a API oficial da Brevo (v3) via `fetch` server-side, sem SDK:
 *   POST https://api.brevo.com/v3/smtp/email
 *
 * ─── REGRAS DESTA CAMADA ─────────────────────────────────────
 * 1. A `BREVO_API_KEY` é lida SÓ aqui, nunca é devolvida por função
 *    pública, nunca entra em log e nunca vai em resposta da API.
 * 2. Configuração ausente NÃO é erro fatal: devolve
 *    `{ enviado: false, motivo: 'nao_configurado' }`. O pedido segue
 *    sendo criado normalmente.
 * 3. Falha de rede/HTTP também não lança para o chamador: devolve os
 *    motivos em texto curto e seguro (sem corpo bruto, sem chave).
 * 4. Nenhum dado de cartão, preço recalculado aqui ou alteração de
 *    pedido acontece neste módulo — ele apenas lê o pedido recebido.
 */

'use strict';

const BREVO_API = String(process.env.BREVO_API_BASE || 'https://api.brevo.com').replace(/\/+$/, '');
const BREVO_ENDPOINT = BREVO_API + '/v3/smtp/email';

/* Marca usada no corpo do e-mail. Não vem de variável de ambiente:
   o remetente configurado manda apenas em FROM. */
const MARCA = 'GRACIOU';

/* ─────────────────────────────────────────────
   CONFIGURAÇÃO
   Mesmo padrão de backend/pagamentos.js: uma função `config()` que
   devolve valores já normalizados e um `validarConfiguracao()` que
   diz apenas SE estão presentes — nunca o valor.
   ───────────────────────────────────────────── */
function config() {
  return {
    apiKey: String(process.env.BREVO_API_KEY || '').trim(),
    remetenteEmail: String(process.env.BREVO_SENDER_EMAIL || '').trim(),
    remetenteNome: String(process.env.BREVO_SENDER_NAME || '').trim() || MARCA
  };
}

function validarConfiguracao() {
  const c = config();
  return {
    apiKey: Boolean(c.apiKey),
    remetenteEmail: Boolean(c.remetenteEmail),
    remetenteNome: Boolean(String(process.env.BREVO_SENDER_NAME || '').trim()),
    completa: Boolean(c.apiKey && c.remetenteEmail)
  };
}

/* ─────────────────────────────────────────────
   FORMATAÇÃO (dinheiro em centavos, como no catálogo)
   Reproduz o mesmo formato de dados/catalogo.js ("R$ 000,00") sem
   importar o módulo do catálogo — o e-mail não recalcula nada.
   ───────────────────────────────────────────── */
function dinheiro(centavos) {
  if (centavos === null || centavos === undefined) return null;
  return 'R$ ' + (Number(centavos) / 100).toFixed(2).replace('.', ',');
}

function escapar(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Texto do frete a partir do valor gravado no pedido.
 *   0     → "Frete grátis"
 *   null  → "a calcular" (a regra do catálogo não informa número)
 *   > 0   → valor formatado
 */
function textoFrete(frete) {
  if (frete === null || frete === undefined) return 'A calcular (confirmaremos o valor em seguida)';
  if (Number(frete) === 0) return 'Grátis';
  return dinheiro(frete);
}

function formaPagamento(forma) {
  return String(forma || '').toLowerCase() === 'cartao' ? 'Cartão' : 'Pix';
}

/** Endereço em uma linha, apenas com o que o pedido realmente tem. */
function enderecoEmLinha(endereco) {
  const e = endereco && typeof endereco === 'object' ? endereco : {};
  const rua = [e.rua, e.numero].filter(Boolean).join(', ');
  const partes = [
    rua,
    e.complemento || '',
    e.bairro || '',
    [e.cidade, e.estado].filter(Boolean).join(' - '),
    e.cep || ''
  ].filter(Boolean);
  return partes.join(' • ') || 'Endereço não informado';
}

/* ─────────────────────────────────────────────
   CORPO DO E-MAIL
   Montado SEMPRE a partir do pedido já recalculado pelo servidor.
   ───────────────────────────────────────────── */
function montarConteudo(pedido) {
  const p = pedido && typeof pedido === 'object' ? pedido : {};
  const cliente = p.cliente || {};
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const endereco = p.endereco || {};
  const numero = p.id || p.numero || '';
  const nome = cliente.nome || 'Cliente';

  const linhas = itens.map((item) => {
    const qtd = Number(item.quantidade) || 0;
    const unitario = item.precoUnitario !== undefined && item.precoUnitario !== null
      ? item.precoUnitario
      : (String((p.pagamento && p.pagamento.forma) || '').toLowerCase() === 'cartao'
        ? item.precoCartaoCentavos
        : item.precoPixCentavos);
    const totalItem = unitario !== null && unitario !== undefined ? unitario * qtd : null;
    return {
      nome: item.nome || item.productId || 'Peça',
      tamanho: item.tamanho || '',
      cor: item.cor || '',
      quantidade: qtd,
      unitarioFormatado: dinheiro(unitario),
      totalFormatado: dinheiro(totalItem),
      descricao: [item.tamanho ? 'Tam. ' + item.tamanho : '', item.cor || ''].filter(Boolean).join(' · ')
    };
  });

  return {
    numero: numero,
    nome: nome,
    email: cliente.email || '',
    itens: linhas,
    subtotalFormatado: dinheiro(p.subtotal),
    descontoFormatado: p.desconto ? dinheiro(p.desconto) : null,
    cupom: p.cupom && p.cupom.codigo ? p.cupom.codigo : null,
    freteTexto: textoFrete(p.frete),
    totalFormatado: p.total === null || p.total === undefined
      ? 'A calcular (frete pendente)'
      : dinheiro(p.total),
    formaPagamento: formaPagamento(p.pagamento && p.pagamento.forma),
    enderecoLinha: enderecoEmLinha(endereco),
    endereco: endereco
  };
}

function montarTexto(conteudo) {
  const linhas = [
    `Olá, ${conteudo.nome}!`,
    '',
    `Recebemos o seu pedido ${conteudo.numero} e ele já está registrado.`,
    '',
    'ITENS',
    ...conteudo.itens.map((i) =>
      `- ${i.quantidade}x ${i.nome}${i.descricao ? ' (' + i.descricao + ')' : ''}` +
      (i.unitarioFormatado ? ` — ${i.unitarioFormatado} cada` : '')
    ),
    '',
    `Subtotal: ${conteudo.subtotalFormatado || '-'}`,
    conteudo.descontoFormatado ? `Desconto${conteudo.cupom ? ' (' + conteudo.cupom + ')' : ''}: -${conteudo.descontoFormatado}` : null,
    `Frete: ${conteudo.freteTexto}`,
    `Total: ${conteudo.totalFormatado}`,
    `Forma de pagamento: ${conteudo.formaPagamento}`,
    '',
    'ENDEREÇO DE ENTREGA',
    conteudo.enderecoLinha,
    '',
    'O código de rastreio será enviado em um e-mail separado assim que o pedido for despachado.',
    '',
    `${MARCA} — Graça em cada fio.`
  ].filter((linha) => linha !== null);

  return linhas.join('\n');
}

function montarHtml(conteudo) {
  const linhasItens = conteudo.itens.map((i) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">
        <strong>${escapar(i.nome)}</strong>${i.descricao ? `<br><span style="color:#666;font-size:13px;">${escapar(i.descricao)}</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${escapar(i.quantidade)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${escapar(i.totalFormatado || '-')}</td>
    </tr>`).join('');

  const linhaDesconto = conteudo.descontoFormatado
    ? `<tr><td style="padding:4px 0;">Desconto${conteudo.cupom ? ` (${escapar(conteudo.cupom)})` : ''}</td><td style="text-align:right;">-${escapar(conteudo.descontoFormatado)}</td></tr>`
    : '';

  const e = conteudo.endereco || {};
  const enderecoHtml = [
    [e.rua, e.numero].filter(Boolean).join(', '),
    e.complemento || '',
    e.bairro || '',
    [e.cidade, e.estado].filter(Boolean).join(' - '),
    e.cep || ''
  ].filter(Boolean).map((l) => escapar(l)).join('<br>') || 'Endereço não informado';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f6f6f2;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:8px;">
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0;font-size:20px;letter-spacing:2px;">${MARCA}</h1>
          <p style="margin:16px 0 0;font-size:16px;">Olá, ${escapar(conteudo.nome)}!</p>
          <p style="margin:8px 0 0;font-size:14px;color:#444;">
            Recebemos o seu pedido <strong>${escapar(conteudo.numero)}</strong> e ele já está registrado.
          </p>
        </td></tr>

        <tr><td style="padding:16px 32px 0;">
          <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#4F5D3A;margin:0 0 8px;">Itens</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;">
            <tr>
              <th align="left" style="padding:0 0 6px;font-size:12px;color:#888;font-weight:normal;">Peça</th>
              <th align="center" style="padding:0 0 6px;font-size:12px;color:#888;font-weight:normal;">Qtd</th>
              <th align="right" style="padding:0 0 6px;font-size:12px;color:#888;font-weight:normal;">Total</th>
            </tr>
            ${linhasItens}
          </table>
        </td></tr>

        <tr><td style="padding:16px 32px 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;">
            <tr><td style="padding:4px 0;">Subtotal</td><td style="text-align:right;">${escapar(conteudo.subtotalFormatado || '-')}</td></tr>
            ${linhaDesconto}
            <tr><td style="padding:4px 0;">Frete</td><td style="text-align:right;">${escapar(conteudo.freteTexto)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;border-top:1px solid #eee;">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;border-top:1px solid #eee;">${escapar(conteudo.totalFormatado)}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Forma de pagamento</td><td style="text-align:right;color:#666;">${escapar(conteudo.formaPagamento)}</td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:16px 32px 0;">
          <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#4F5D3A;margin:0 0 8px;">Endereço de entrega</h2>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#333;">${enderecoHtml}</p>
        </td></tr>

        <tr><td style="padding:16px 32px 28px;">
          <p style="margin:0;font-size:13px;color:#666;background:#f6f6f2;border-radius:6px;padding:12px;">
            O código de rastreio será enviado em um e-mail separado assim que o pedido for despachado.
          </p>
        </td></tr>

        <tr><td style="padding:0 32px 28px;">
          <p style="margin:0;font-size:12px;color:#999;">${MARCA} — Graça em cada fio.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ─────────────────────────────────────────────
   ENVIO
   ───────────────────────────────────────────── */
/**
 * Envia o e-mail de confirmação do pedido.
 *
 * NUNCA lança: qualquer problema vira `{ enviado: false, motivo, status }`.
 * Isso garante o requisito de que uma falha de e-mail não derruba a
 * criação do pedido.
 *
 * @param {object} pedido pedido já recalculado pelo servidor
 * @returns {Promise<{enviado:boolean, motivo?:string, status?:number, messageId?:string|null}>}
 */
async function enviarConfirmacaoPedido(pedido) {
  const c = config();

  if (!c.apiKey || !c.remetenteEmail) {
    return { enviado: false, motivo: 'nao_configurado' };
  }

  if (!pedido || typeof pedido !== 'object') {
    return { enviado: false, motivo: 'pedido_invalido' };
  }

  const destinatario = pedido.cliente && String(pedido.cliente.email || '').trim();
  if (!destinatario) {
    return { enviado: false, motivo: 'sem_destinatario' };
  }

  const conteudo = montarConteudo(pedido);
  const corpo = {
    sender: { email: c.remetenteEmail, name: c.remetenteNome },
    to: [{ email: destinatario, name: conteudo.nome }],
    subject: `Pedido ${conteudo.numero} confirmado — ${MARCA}`,
    htmlContent: montarHtml(conteudo),
    textContent: montarTexto(conteudo),
    /* Cabeçalho de correlação: facilita achar o envio na Brevo pelo
       número do pedido, sem guardar nada sensível. */
    headers: { 'X-GRACIOU-Pedido': String(conteudo.numero || '') },
    tags: ['confirmacao-pedido']
  };

  let resposta;
  try {
    resposta = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': c.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(corpo)
    });
  } catch (erro) {
    /* Rede fora do ar/rejeitada: motivo curto, sem stack nem chave. */
    return { enviado: false, motivo: 'falha_de_rede', detalhe: erro && erro.name ? erro.name : 'Error' };
  }

  if (!resposta.ok) {
    /* Só o status HTTP. O corpo da Brevo pode conter detalhes da
       conta/remetente e não é útil para o operador neste ponto. */
    return { enviado: false, motivo: 'brevo_recusou', status: resposta.status };
  }

  let dados = null;
  try { dados = await resposta.json(); } catch (_) { dados = null; }

  return {
    enviado: true,
    status: resposta.status,
    messageId: dados && dados.messageId ? String(dados.messageId) : null
  };
}

module.exports = {
  config,
  validarConfiguracao,
  enviarConfirmacaoPedido,
  /* Expostos com prefixo `_` apenas para o teste automatizado poder
     conferir o corpo montado sem disparar rede. A API não os usa. */
  _montarConteudoParaTeste: montarConteudo,
  _montarTextoParaTeste: montarTexto,
  _montarHtmlParaTeste: montarHtml
};

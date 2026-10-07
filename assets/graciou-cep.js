/* ══════════════════════════════════════════════════════════════
   GRACIOU — CEP: máscara e consulta ao ViaCEP.

   Regras deste arquivo:
     - endereço fixo: https://viacep.com.br/ws/{CEP}/json/
     - 8 dígitos → consulta; qualquer outra quantidade → nada acontece;
     - um CEP só é consultado UMA vez (cache em memória);
     - falha do ViaCEP (rede, HTTP, JSON quebrado) é devolvida como
       erro tratado, NUNCA como exceção: o checkout não pode quebrar
       por causa do ViaCEP;
     - nada é armazenado em serviço externo — só o CEP vai na URL,
       como o próprio ViaCEP exige.

   Usado pelo checkout.html e testável pelo Node
   (scripts/testar-validacao-checkout.js) com um fetch falso.
   ══════════════════════════════════════════════════════════════ */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.GRACIOU_CEP = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var URL_BASE   = 'https://viacep.com.br/ws/';
  var TIMEOUT_MS = 8000;

  /** Só os dígitos do CEP (máx. 8). */
  function somenteDigitos(valor) {
    return String(valor === undefined || valor === null ? '' : valor)
      .replace(/\D/g, '')
      .slice(0, 8);
  }

  /** Máscara visual 00000-000. */
  function mascara(valor) {
    var d = somenteDigitos(valor);
    if (d.length <= 5) return d;
    return d.slice(0, 5) + '-' + d.slice(5);
  }

  function urls(cep) {
    var d = somenteDigitos(cep);
    return {
      json: URL_BASE + d + '/json/',
      xml: URL_BASE + d + '/xml/'
    };
  }

  /* Cache em memória: mesmo CEP → no máximo uma consulta por sessão.
     Não é persistido em lugar nenhum. */
  var cache = Object.create(null);

  function limparCache() { cache = Object.create(null); }

  /**
   * Consulta o ViaCEP para um CEP de 8 dígitos.
   * Resolve SEMPRE (nunca rejeita) com uma destas formas:
   *   { ok:true,  cep, estado, cidade, bairro, rua }
   *   { ok:false, motivo:'incompleto' | 'nao_encontrado' | 'falha' }
   *
   * `fetchImpl` só é herdado do ambiente quando for undefined; passar
   * null explicitamente significa "sem rede disponível".
   */
  function consultar(cep, fetchImpl) {
    var d = somenteDigitos(cep);
    if (d.length !== 8) {
      return Promise.resolve({ ok: false, motivo: 'incompleto' });
    }

    if (cache[d]) return cache[d];

    var buscar = fetchImpl === undefined
      ? (typeof fetch === 'function' ? fetch : null)
      : fetchImpl;
    if (!buscar) {
      return Promise.resolve({ ok: false, motivo: 'falha' });
    }

    function guardar(novaEntrada) {
      /* Só respostas boas entram no cache: uma falha pode ser tentada
         de novo (o ViaCEP pode ter oscilado). */
      if (novaEntrada && novaEntrada.ok) cache[d] = Promise.resolve(novaEntrada);
      return novaEntrada;
    }

    function falhar() { return guardar({ ok: false, motivo: 'falha' }); }

    var controlador = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var temporizador = controlador
      ? setTimeout(function () { controlador.abort(); }, TIMEOUT_MS)
      : null;

    function encerrar() {
      if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    }

    var promessa = Promise.resolve(buscar(urls(d).json, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controlador ? controlador.signal : undefined
    })).then(function (resposta) {
      encerrar();
      if (!resposta || !resposta.ok) return falhar();
      return resposta.json();
    }).then(function (dadosCep) {
      /* A falha controlada do passo anterior não é uma resposta de CEP:
         passa direto, sem virar "encontrado" por engano. */
      if (dadosCep && dadosCep.ok === false) return dadosCep;
      /* ViaCEP responde 200 com {"erro": true} para CEP inexistente. */
      if (!dadosCep || dadosCep.erro === true) return guardar({ ok: false, motivo: 'nao_encontrado' });
      return guardar({
        ok: true,
        cep: String(dadosCep.cep || mascara(d)),
        estado: String(dadosCep.uf || '').toUpperCase().slice(0, 2),
        cidade: String(dadosCep.localidade || ''),
        bairro: String(dadosCep.bairro || ''),
        rua: String(dadosCep.logradouro || '')
      });
    }).catch(function () {
      encerrar();
      /* Rede fora, CORS, timeout ou JSON inválido: falha tratada. */
      return falhar();
    });

    return promessa;
  }

  return {
    urlBase: URL_BASE,
    urls: urls,
    somenteDigitos: somenteDigitos,
    mascara: mascara,
    consultar: consultar,
    limparCache: limparCache
  };
});

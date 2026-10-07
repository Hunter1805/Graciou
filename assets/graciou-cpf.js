/* ══════════════════════════════════════════════════════════════
   GRACIOU — CPF: máscara, dígitos apenas e validação completa.

   ARQUIVO SEM EFEITO COLATERAL. Só define funções puras e expõe o
   global window.GRACIOU_CPF. Não faz fetch, não grava nada, não
   depende de DOM — por isso pode ser exigido diretamente pelo Node
   nos testes (scripts/testar-validacao-checkout.js).

   Cobre os três casos pedidos:
     - formato incompleto (menos de 11 dígitos);
     - sequências repetidas (000.000.000-00 e afins);
     - dígitos verificadores errados.

   Nenhum CPF sai daqui para lugar nenhum: é usado apenas no navegador
   para liberar o envio do formulário.
   ══════════════════════════════════════════════════════════════ */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.GRACIOU_CPF = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Só os dígitos, sem nenhum separador. */
  function somenteDigitos(valor) {
    return String(valor === undefined || valor === null ? '' : valor)
      .replace(/\D/g, '')
      .slice(0, 11);
  }

  /** Máscara visual 000.000.000-00, aplicada enquanto a pessoa digita. */
  function mascara(valor) {
    var d = somenteDigitos(valor);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
  }

  /**
   * Valida CPF pelos dois dígitos verificadores (módulo 11).
   * Aceita com ou sem pontuação. Sequências repetidas são recusadas
   * mesmo passando no cálculo (111.111.111-11 é matematicamente
   * "válido", mas não é um CPF real).
   */
  function valido(valor) {
    var d = somenteDigitos(valor);
    if (d.length !== 11) return false;

    /* ── Sequências repetidas ── */
    if (/^(\d)\1{10}$/.test(d)) return false;

    /* ── 1º dígito verificador: pesos 10..2 sobre os 9 primeiros ── */
    var soma = 0;
    for (var i = 0; i < 9; i++) soma += parseInt(d.charAt(i), 10) * (10 - i);
    var resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(d.charAt(9), 10)) return false;

    /* ── 2º dígito verificador: pesos 11..2 sobre os 10 primeiros ── */
    soma = 0;
    for (var j = 0; j < 10; j++) soma += parseInt(d.charAt(j), 10) * (11 - j);
    resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(d.charAt(10), 10)) return false;

    return true;
  }

  /**
   * Mensagem clara para o usuário, ou string vazia quando o CPF está ok.
   * A ordem importa: primeiro o que falta, depois o que está errado.
   */
  function mensagem(valor) {
    var d = somenteDigitos(valor);
    if (!d) return 'Informe seu CPF.';
    if (d.length < 11) return 'CPF incompleto. Use o formato 000.000.000-00.';
    if (/^(\d)\1{10}$/.test(d)) return 'CPF inválido: não use números repetidos.';
    if (!valido(d)) return 'CPF inválido. Confira os números e digite novamente.';
    return '';
  }

  return {
    somenteDigitos: somenteDigitos,
    mascara: mascara,
    valido: valido,
    mensagem: mensagem,
    /* Nome explícito para quem lê o código e procura a regra. */
    validarDigitosVerificadores: valido
  };
});

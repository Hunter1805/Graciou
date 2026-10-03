import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../backend/env').carregar();
const repositorio = require('../backend/repositorio');

const agora = new Date();
const codigo = `GR-TESTE-${agora.getTime()}`;
const dados = {
  id: codigo,
  criado_em: agora.toISOString(),
  cliente_nome: 'Teste temporário',
  cliente_email: 'teste-temporario@example.invalid',
  cliente_telefone: null,
  cliente_cpf: null,
  endereco_json: JSON.stringify({ rua: 'Teste', numero: '0', cidade: 'Teste', estado: 'SP', cep: '00000' }),
  itens_json: JSON.stringify([
    { productId: 'tee-graca-permanece', nome: 'Camiseta de teste', tamanho: 'M', cor: 'Verde-musgo', quantidade: 2, precoUnitario: 9990 }
  ]),
  forma_pagamento: 'pix',
  status_pagamento: 'aguardando',
  cupom_codigo: null,
  subtotal: 19980,
  desconto: 0,
  frete: 0,
  total: 19980,
  status_pedido: 'aguardando_pagamento',
  rastreio: null,
  observacoes: 'Registro temporário de teste.'
};

function conferir(nome, ok) {
  if (!ok) throw new Error(`Falhou: ${nome}`);
  console.log(`OK — ${nome}`);
}

let criado = false;
try {
  conferir('Supabase selecionado', repositorio.usandoSupabase());
  const cupons = await repositorio.listarCupons();
  conferir('leitura de cupons', Array.isArray(cupons));

  const criadoPedido = await repositorio.inserirPedido(dados);
  criado = true;
  conferir('criação de pedido temporário', criadoPedido && criadoPedido.id === codigo);
  conferir('itens persistidos', criadoPedido.itens.length === 1 && criadoPedido.itens[0].quantidade === 2);

  const lido = await repositorio.buscarPedido(codigo);
  conferir('leitura do pedido', lido && lido.id === codigo);
  conferir('leitura dos itens', lido.itens.length === 1 && lido.itens[0].productId === 'tee-graca-permanece');

  const atualizado = await repositorio.atualizarPedido(codigo, {
    statusPedido: 'pago',
    rastreio: 'TESTE-RASTREIO'
  });
  conferir('atualização de status', atualizado.statusPedido === 'pago');
  conferir('atualização de rastreio', atualizado.rastreio === 'TESTE-RASTREIO');
} finally {
  if (criado) {
    const removido = await repositorio.deletarPedido(codigo);
    conferir('remoção do pedido de teste', removido === true);
    conferir('pedido de teste removido', (await repositorio.buscarPedido(codigo)) === null);
  }
}

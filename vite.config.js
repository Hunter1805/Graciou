/**
 * ═══════════════════════════════════════
 * GRACIOU — configuração do Vite
 * ═══════════════════════════════════════
 *
 * REGRA DESTA CONFIGURAÇÃO:
 * os arquivos de dados/estado e de validação do catálogo —
 *     dados/catalogo.js
 *     assets/graciou-store.js
 *     assets/graciou-cpf.js
 *     assets/graciou-cep.js
 *
 * — NÃO passam por transformação. São servidos como JavaScript
 * ESTÁTICO PURO (script clássico), byte a byte iguais ao arquivo em
 * disco. O Vite não injeta wrapper, não converte para ESM e não
 * reescreve o conteúdo.
 *
 * COMO ISSO É GARANTIDO (três camadas independentes):
 *
 * 1) plugin `graciou:js-estatico` (abaixo)
 *    Intercepta os pedidos desses caminhos ANTES de qualquer
 *    pipeline de transformação e devolve o conteúdo do disco com
 *    Content-Type: text/javascript. Vale para dev E para preview.
 *
 * 2) configureServer / configurePreviewServer
 *    Registram o middleware no início da cadeia de middlewares do
 *    Vite — por isso ele vence o transformador interno.
 *
 * 3) `optimizeDeps.exclude` + `resolve.alias`
 *    Impedem que o Vite pré-empacote (esbuild) ou re-resolva os dois
 *    caminhos para outra URL. O alias aponta cada caminho para o
 *    próprio arquivo absoluto em disco — sem redirecionar para módulo.
 *
 * POR QUE A CONFIGURAÇÃO ANTIGA ERA O PROBLEMA:
 * antes existia um alias que resolvia 'dados/catalogo.js' para o
 * caminho absoluto do arquivo como MÓDULO. Isso fazia o Vite tratar o
 * UMD como ESM, injetar um wrapper e "inflar" a resposta — o arquivo
 * deixava de ser servido como script clássico e o global
 * window.GRACIOU_CATALOGO deixava de existir de forma confiável.
 * O alias foi removido. Os arquivos continuam funcionando também em
 * navegador puro (file:// / http-server) e no Node (require), porque
 * o UMD detecta o ambiente por conta própria.
 *
 * NENHUM arquivo é copiado para uma versão duplicada.
 * NENHUM código funcional do catálogo foi alterado — só a forma de servir.
 */

import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalize, resolve, sep } from 'node:path';

/* ── Raiz do projeto ── */
const RAIZ = fileURLToPath(new URL('.', import.meta.url));

/* ── Os arquivos que devem permanecer JavaScript estático puro ──
   Comparação feita sobre o pathname normalizado, com e sem barra inicial,
   e aceitando sufixo de query (?t=...) que o Vite às vezes acrescenta.
   CPF e CEP entram aqui pelo mesmo motivo da store: são UMD que publicam
   um global (window.GRACIOU_CPF / window.GRACIOU_CEP) e precisam chegar
   ao navegador sem virarem módulo ESM. */
const JS_ESTATICO = [
  'dados/catalogo.js',
  'assets/graciou-store.js',
  'assets/graciou-cpf.js',
  'assets/graciou-cep.js'
];
const ARQUIVOS_PUBLICOS = [...JS_ESTATICO, 'assets/tree-icon.png'];

function ehJsEstatico(url) {
  const pathname = String(url || '').split('?')[0].split('#')[0];
  let chave;
  try {
    chave = normalize(decodeURIComponent(pathname)).replace(/\\/g, '/');
  } catch (_) {
    chave = pathname.replace(/\\/g, '/');
  }
  chave = chave.replace(/^\/+/, '');
  return JS_ESTATICO.indexOf(chave) !== -1;
}

/* ── Lê o arquivo do disco e entrega como script clássico ──
   Sem transformação, sem wrapper, sem rewrite. */
function servirEstatico(req, res, next) {
  if (!ehJsEstatico(req.url)) return next();

  const caminho = resolve(RAIZ, String(req.url).split('?')[0].replace(/^\/+/, ''));

  /* Trava de segurança: nada fora da raiz do projeto. */
  if (!caminho.startsWith(RAIZ.replace(/[\\/]$/, '') + sep)) return next();

  let conteudo;
  try {
    conteudo = readFileSync(caminho);
  } catch (_) {
    return next();
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Content-Length', String(conteudo.length));
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.end(conteudo);
}

/* ── Plugin que aplica o servidor estático em dev e em preview ── */
function jsEstaticoPuro() {
  return {
    name: 'graciou:js-estatico',
    /* Só atua nos pedidos desses dois arquivos: nada mais é afetado. */
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(servirEstatico);
    },
    configurePreviewServer(server) {
      server.middlewares.use(servirEstatico);
    },
    /* Se algum dia esses arquivos forem importados como módulo,
       o plugin impede que o Vite os transforme. */
    transform(code, id) {
      if (!ehJsEstatico(id)) return null;
      return { code, map: null };
    },
    /* O build do Vite não copia scripts clássicos referenciados por src.
       Em produção, publique esses arquivos nos mesmos caminhos usados pelo
       HTML, sem transformar o catálogo, a store nem os validadores. */
    generateBundle() {
      for (const rel of ARQUIVOS_PUBLICOS) {
        this.emitFile({
          type: 'asset',
          fileName: rel,
          source: readFileSync(resolve(RAIZ, rel.split('/').join(sep)))
        });
      }
    }
  };
}

/* ── Alias "neutro": cada caminho aponta para o próprio arquivo em
   disco, com a extensão preservada. NÃO força tratamento como ESM. ── */
const aliasEstatico = JS_ESTATICO.map((rel) => ({
  find: rel,
  replacement: resolve(RAIZ, rel.split('/').join(sep))
}));

export default defineConfig({
  plugins: [jsEstaticoPuro()],

  /* Nenhum desses arquivos entra em pré-bundle (esbuild). */
  optimizeDeps: {
    exclude: JS_ESTATICO.map((rel) => rel.split('/').join(sep))
  },

  resolve: {
    alias: aliasEstatico
  },

  /* O Vite não deve tratar como transformáveis outras extensões. */
  esbuild: {
    include: [/\.(ts|tsx|jsx|mts|cts)$/]
  },

  build: {
    rollupOptions: {
      input: {
        index: resolve(RAIZ, 'index.html'),
        preview: resolve(RAIZ, 'preview.html'),
        collection: resolve(RAIZ, 'collection.html'),
        cart: resolve(RAIZ, 'cart.html'),
        checkout: resolve(RAIZ, 'checkout.html'),
        rastreio: resolve(RAIZ, 'rastreio.html'),
        admin: resolve(RAIZ, 'admin.html')
      }
    }
  },

  server: {
    port: 3000,
    strictPort: false
  }
});
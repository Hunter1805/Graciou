/** Servidor estático simples para testar o HTML fora do Vite. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = process.cwd();
const TIPOS = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.png': 'image/png',
  '.mjs': 'text/javascript',
  '.json': 'application/json'
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const arquivo = path.join(RAIZ, url);

  fs.readFile(arquivo, (err, dados) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404');
    }
    const tipo = TIPOS[path.extname(arquivo)] || 'text/plain';
    res.writeHead(200, { 'Content-Type': tipo + '; charset=utf-8' });
    res.end(dados);
  });
}).listen(3100, () => console.log('servidor estatico em http://localhost:3100'));
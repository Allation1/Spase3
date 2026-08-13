const http = require('http');
const fs = require('fs'); // Підключаємо модуль для роботи з файловою системою
const path = require('path'); // Підключаємо модуль для роботи зі шляхами

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
  // Визначаємо шлях до файлу, який запитує клієнт
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html'; // Якщо запит на кореневий шлях, віддаємо index.html
  }

  // Визначаємо розширення файлу для встановлення правильного Content-Type
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == 'ENOENT') {
        // Файл не знайдено (404)
        fs.readFile('./404.html', (error404, content404) => {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content404 || '<h1>404 Not Found</h1>', 'utf-8');
        });
      } else {
        // Інша помилка сервера (500)
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
        res.end();
      }
    } else {
      // Успішно віддаємо файл (200)
      res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, hostname, () => {
  console.log(`Сервер запущено та працює за адресою http://${hostname}:${port}/`);
});
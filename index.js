const http = require('http');
const fs = require('fs'); // Підключаємо модуль для роботи з файловою системою
const path = require('path'); // Підключаємо модуль для роботи зі шляхами
const WebSocket = require('ws'); // Підключаємо WebSocket

const hostname = '127.0.0.1';
const port = 3000;

// --- Створення HTTP-сервера для віддачі файлів ---
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
    '.js': 'application/javascript',
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

// --- Створення WebSocket-сервера для ігрової логіки ---
const wss = new WebSocket.Server({ server });

let gameState = {
  asteroids: []
};
let nextAsteroidId = 0;

wss.on('connection', ws => {
  console.log('Клієнт підключився');
  ws.on('close', () => {
    console.log('Клієнт відключився');
  });
});

function broadcastGameState() {
  const data = JSON.stringify(gameState);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// --- Ігрова логіка ---

// Створення астероїдів кожні 4 секунди
setInterval(() => {
  const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
  let x, y;
  const position = Math.random() * 100; // Позиція вздовж краю (0-100%)

  if (side === 0) { x = position; y = 0; }       // Top
  else if (side === 1) { x = 100; y = position; } // Right
  else if (side === 2) { x = position; y = 100; } // Bottom
  else { x = 0; y = position; }                   // Left

  // Розрахунок вектора руху до центру (50, 50)
  const dx = 50 - x;
  const dy = 50 - y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const speed = 0.5; // Швидкість астероїда

  const newAsteroid = {
    id: nextAsteroidId++,
    x: x,
    y: y,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
  };
  gameState.asteroids.push(newAsteroid);
}, 4000);

// Основний ігровий цикл (оновлення позицій)
setInterval(() => {
  gameState.asteroids.forEach((asteroid, index) => {
    asteroid.x += asteroid.vx;
    asteroid.y += asteroid.vy;

    // Видаляємо астероїд, якщо він долетів до центру
    if (Math.abs(asteroid.x - 50) < 1 && Math.abs(asteroid.y - 50) < 1) {
      gameState.asteroids.splice(index, 1);
    }
  });
  broadcastGameState(); // Надсилаємо оновлений стан усім гравцям
}, 50); // Оновлення ~20 разів на секунду

server.listen(port, hostname, () => {
  console.log(`Сервер запущено та працює за адресою http://${hostname}:${port}/`);
});
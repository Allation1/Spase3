const http = require('http');
const fs = require('fs'); // Підключаємо модуль для роботи з файловою системою
const path = require('path'); // Підключаємо модуль для роботи зі шляхами
const WebSocket = require('ws'); // Підключаємо WebSocket

const hostname = '127.0.0.1';
const port = 3000;

// --- Константи для ігрової логіки ---
const BASE_X = 50; // Координата X бази (центр карти)
const BASE_Y = 50; // Координата Y бази (центр карти)

const weaponStats = {
  lightMachineGun: {
    name: "Легкий кулимет",
    damage: 1,
    range: 10, // Дальність в одиницях карти (10 одиниць = 10% ширини/висоти карти)
    fireRateMs: 1000, // 1 постріл за секунду
    projectileSpeed: 20 // Швидкість снаряда в одиницях карти за секунду
  }
};

// --- Створення HTTP-сервера для віддачі файлів ---
const server = http.createServer((req, res) => {
  // Визначаємо шлях до файлу, який запитує клієнт
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html'; // Якщо запит на кореневий шлях, віддаємо index.html
  } else if (filePath.startsWith('./node_modules/')) {
    // Забороняємо прямий доступ до node_modules з браузера
    res.writeHead(403); // Forbidden
    res.end('Access Denied');
    return;
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
  asteroids: [],
  projectiles: [] // Новий масив для снарядів
};
let nextAsteroidId = 0;
let nextProjectileId = 0;

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

// --- Логіка стрільби з бази ---
let lastFireTime = 0;
setInterval(() => {
  const now = Date.now();
  const weapon = weaponStats.lightMachineGun;

  if (now - lastFireTime >= weapon.fireRateMs) {
    lastFireTime = now;

    // Знаходимо найближчий астероїд в радіусі дії
    let closestAsteroid = null;
    let minDistance = Infinity;

    gameState.asteroids.forEach(asteroid => {
      const dx = asteroid.x - BASE_X;
      const dy = asteroid.y - BASE_Y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (asteroid.hp > 0 && distance <= weapon.range && distance < minDistance) {
        minDistance = distance;
        closestAsteroid = asteroid;
      }
    });

    if (closestAsteroid) {
      // Застосовуємо урон
      closestAsteroid.hp -= weapon.damage;

      // Створюємо снаряд для анімації на клієнті
      const projectile = {
        id: nextProjectileId++,
        startX: BASE_X,
        startY: BASE_Y,
        endX: closestAsteroid.x, // Снаряд летить до поточної позиції астероїда
        endY: closestAsteroid.y,
        duration: Math.max(100, (minDistance / weapon.projectileSpeed) * 1000) // Тривалість польоту в мс, мінімум 100мс
      };
      gameState.projectiles.push(projectile);
    }
  }
}, 100); // Перевіряємо можливість стрільби кожні 100 мс

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

  // Розрахунок випадкового вектора руху, спрямованого всередину карти
  let targetX = Math.random() * 80 + 10; // Випадкова точка X (10-90)
  let targetY = Math.random() * 80 + 10; // Випадкова точка Y (10-90)

  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const speed = 0.3 + Math.random() * 0.4; // Випадкова швидкість (0.3-0.7)

  const newAsteroid = {
    id: nextAsteroidId++,
    x: x,
    y: y,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
    hp: Math.floor(Math.random() * 10) + 1 // HP від 1 до 10
  };
  gameState.asteroids.push(newAsteroid);
}, 4000);

// Основний ігровий цикл (оновлення позицій)
setInterval(() => {
  // Використовуємо filter для безпечного видалення елементів під час ітерації
  gameState.asteroids = gameState.asteroids.filter(asteroid => {
    asteroid.x += asteroid.vx;
    asteroid.y += asteroid.vy;

    // Видаляємо, якщо HP <= 0 або астероїд вилетів за межі карти (з невеликим запасом)
    return asteroid.hp > 0 && asteroid.x > -5 && asteroid.x < 105 && asteroid.y > -5 && asteroid.y < 105;
  });

  // Видалення снарядів, які вже долетіли
  const now = Date.now();
  gameState.projectiles = gameState.projectiles.filter(p => {
    // Якщо снаряд щойно створений, йому ще не присвоєно startTime.
    // Присвоюємо його при першій ітерації після створення.
    if (!p.startTime) {
      p.startTime = now;
    }
    return (now - p.startTime) < p.duration;
  });
  broadcastGameState(); // Надсилаємо оновлений стан усім гравцям
}, 50); // Оновлення ~20 разів на секунду

server.listen(port, hostname, () => {
  console.log(`Сервер запущено та працює за адресою http://${hostname}:${port}/`);
});
const http = require('http');
const fs = require('fs'); // Підключаємо модуль для роботи з файловою системою
const path = require('path'); // Підключаємо модуль для роботи зі шляхами
const WebSocket = require('ws'); // Підключаємо WebSocket

const hostname = '127.0.0.1';
const port = 3000;

// --- Константи для ігрової логіки ---
const BASE_X = 50; // Координата X бази (центр карти)
const BASE_Y = 50; // Координата Y бази (центр карти)

const miningLaserStats = {
  ice: {
    range: 20,
    resourceType: 'ice',
    miningIntervalMs: 30000 // 1 одиниця за 30 секунд
  },
  ironOre: {
    range: 20,
    resourceType: 'ironOre',
    miningIntervalMs: 30000 // 1 одиниця за 30 секунд
  },
  shipWreckage: {
    range: 20,
    resourceType: 'shipWreckage',
    miningIntervalMs: 30000 // 1 одиниця за 30 секунд
  }
};

const factoryStats = {
  smelter: {
    inputResource: 'ironOre',
    outputResource: 'metal',
    processingTimeMs: 30000 // 1 одиниця за 30 секунд
  },
  iceProcessor: {
    inputResource: 'ice',
    outputResource: 'water',
    processingTimeMs: 30000 // 1 одиниця за 30 секунд
  }
};

const weaponStats = {
  lightMachineGun: {
    name: "Легкий кулимет",
    damage: 1,
    range: 20, // Дальність в одиницях карти (20 одиниць = 20% ширини/висоти карти)
    fireRateMs: 1000, // 1 постріл за секунду
    projectileSpeed: 40 // Швидкість снаряда в одиницях карти за секунду (збільшено)
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
  pirates: [],
  pirateProjectiles: [],
  projectiles: [], // Новий масив для снарядів
  resourceChunks: [], // Новий масив для уламків ресурсів
  playerResources: {
    ice: 0,
    ironOre: 0,
    shipWreckage: 0,
    metal: 0,
    water: 0
  },
  base: {
    hp: 100,
    maxHp: 100
  },
  wave: {
    number: 0,
    piratesToSpawn: 0,
    piratesRemaining: 0,
    nextWaveIn: 0 // Час в мс до наступної хвилі
  },
  repairEffects: [], // Для анімації ремонту
  miningPulses: [], // Для візуалізації імпульсів добування
  factories: {
    smelter: { status: 'idle', startTime: 0 },
    iceProcessor: { status: 'idle', startTime: 0 }
  },
  science: {
    hullStudy: { status: 'idle', startTime: 0, isAutomatic: false },
    points: 0,
    upgrades: {
      baseArmor: { level: 0 },
      wreckageDropChance: { level: 0 },
      hullResearch: { level: 0 }
    }
  },
  defenseUpgrades: {
    baseArmor: { level: 0 }
  },
  repairDrone: {
    status: 'idle', startTime: 0
  },
  miningLasers: {
    ice: { status: 'idle', targetChunkId: null, startTime: 0 },
    ironOre: { status: 'idle', targetChunkId: null, startTime: 0 },
    shipWreckage: { status: 'idle', targetChunkId: null, startTime: 0 }
  }
};
let nextAsteroidId = 0;
let nextPirateId = 0;
let nextProjectileId = 0;
let nextChunkId = 0;

wss.on('connection', ws => {
  console.log('Клієнт підключився');
  ws.on('close', () => {
    console.log('Клієнт відключився');
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const science = gameState.science;

      if (data.action === 'toggle_hull_study') {
        science.hullStudy.isAutomatic = !science.hullStudy.isAutomatic;
        if (!science.hullStudy.isAutomatic) { // Якщо вимикаємо, зупиняємо поточне дослідження
          science.hullStudy.status = 'idle';
          science.hullStudy.startTime = 0;
        }
      } else if (data.action === 'upgrade_armor') {
        const armorUpgrade = gameState.defenseUpgrades.baseArmor;
        const sciencePrerequisite = science.upgrades.baseArmor;
        const baseCost = 10;
        const cost = Math.floor(baseCost * Math.pow(1.1, armorUpgrade.level));

        if (gameState.playerResources.metal >= cost && armorUpgrade.level < sciencePrerequisite.level) {
          gameState.playerResources.metal -= cost;
          armorUpgrade.level += 1;
          gameState.base.maxHp += 10;
        }
      } else if (data.action === 'upgrade') {
        const upgrade = science.upgrades[data.type];
        if (upgrade) {
          const baseCost = 5;
          const cost = Math.floor(baseCost * Math.pow(1.1, upgrade.level));
          if (science.points >= cost) {
            science.points -= cost;
            upgrade.level += 1;
          }
        }
      }
    } catch (error) {
      console.error('Помилка обробки повідомлення від клієнта:', error);
    }
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

    let target = null;
    let minDistance = Infinity;

    // Пріоритет 1: Пірати
    gameState.pirates.forEach(pirate => {
      const dx = pirate.x - BASE_X;
      const dy = pirate.y - BASE_Y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= weapon.range && distance < minDistance) {
        minDistance = distance;
        target = pirate;
      }
    });

    // Пріоритет 2: Астероїди (якщо не знайдено піратів)
    if (!target) {
      gameState.asteroids.forEach(asteroid => {
        const dx = asteroid.x - BASE_X;
        const dy = asteroid.y - BASE_Y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (asteroid.hp > 0 && distance <= weapon.range && distance < minDistance) {
          minDistance = distance;
          target = asteroid;
        }
      });
    }

    if (target) {
      // Застосовуємо урон
      target.hp -= weapon.damage;

      // Якщо ціль - пірат, і його здоров'я <= 0, він буде видалений в основному циклі
      if (target.type === 'pirate' && target.hp <= 0) {
        // Можна додати логіку випадіння луту з пірата тут
      }

      // Створюємо снаряд для анімації на клієнті
      const projectile = {
        id: nextProjectileId++,
        startX: BASE_X,
        startY: BASE_Y,
        endX: target.x,
        endY: target.y,
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
  const hp = Math.floor(Math.random() * 10) + 1;
  const iceAmount = Math.floor(Math.random() * (hp + 1)); // Випадкова кількість льоду від 0 до hp
  const ironOreAmount = hp - iceAmount; // Решта - залізна руда

  const newAsteroid = {
    id: nextAsteroidId++,
    x: x,
    y: y,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
    hp: hp,
    resources: {
      ice: iceAmount,
      ironOre: ironOreAmount
    }
  };
  gameState.asteroids.push(newAsteroid);
}, 4000);

// --- Логіка хвиль піратів ---
let lastPirateSpawnTime = 0;
const PIRATE_SPAWN_INTERVAL = 15000; // 15 секунд
const PEACE_TIME_MS = 5000; // 5 секунд

function managePirateWaves() {
    const now = Date.now();
    const wave = gameState.wave;

    if (wave.piratesRemaining <= 0) {
        // Хвиля закінчилася або ще не починалася
        if (wave.nextWaveIn === 0 && wave.number < 1) { // Початок таймера, тільки якщо це ще не була перша хвиля
            wave.nextWaveIn = now + PEACE_TIME_MS;
        }

        if (now >= wave.nextWaveIn && wave.number < 1) { // Починаємо нову хвилю, тільки якщо це перша хвиля
            wave.number++;
            wave.piratesToSpawn = 100; // Починаємо зі 100 піратів
            wave.piratesRemaining = wave.piratesToSpawn;
            wave.nextWaveIn = 0;
        }
    } else {
        // Хвиля активна, спавнимо піратів
        if (wave.piratesToSpawn > 0 && (now - lastPirateSpawnTime >= PIRATE_SPAWN_INTERVAL)) {
            spawnPirate();
            wave.piratesToSpawn--;
            lastPirateSpawnTime = now;
        }
    }
}

function spawnPirate() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const position = Math.random() * 100;

    if (side === 0) { x = position; y = -5; }
    else if (side === 1) { x = 105; y = position; }
    else if (side === 2) { x = position; y = 105; }
    else { x = -5; y = position; }

    const dx = BASE_X - x;
    const dy = BASE_Y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = 0.5;

    const newPirate = {
        id: nextPirateId++, type: 'pirate', x, y,
        vx: (dx / distance) * speed,
        vy: (dy / distance) * speed,
        hp: 5, state: 'approaching', lastAttackTime: 0,
        orbitAngle: Math.atan2(y - BASE_Y, x - BASE_X)
    };
    gameState.pirates.push(newPirate);
}

// Основний ігровий цикл (оновлення позицій)
setInterval(() => {
  // Оголошуємо 'now' на початку циклу, щоб вона була доступна для всіх операцій
  const now = Date.now();

  // Використовуємо filter для безпечного видалення елементів під час ітерації
  gameState.asteroids = gameState.asteroids.filter(asteroid => {
    asteroid.x += asteroid.vx;
    asteroid.y += asteroid.vy;

    const isAlive = asteroid.hp > 0;
    const isInBounds = asteroid.x > -5 && asteroid.x < 105 && asteroid.y > -5 && asteroid.y < 105;

    if (!isAlive) {
      // Астероїд знищено, створюємо уламки для кожного типу ресурсу
      if (asteroid.resources.ice > 0) {
        gameState.resourceChunks.push({
          id: nextChunkId++,
          x: asteroid.x - 1, // Трохи зміщуємо, щоб уламки не накладались
          y: asteroid.y - 1,
          resourceType: 'ice',
          amount: asteroid.resources.ice
        });
      }
      if (asteroid.resources.ironOre > 0) {
        gameState.resourceChunks.push({
          id: nextChunkId++,
          x: asteroid.x + 1, // Трохи зміщуємо, щоб уламки не накладались
          y: asteroid.y + 1,
          resourceType: 'ironOre',
          amount: asteroid.resources.ironOre
        });
      }
    }

    // Залишаємо астероїд, якщо він живий і в межах карти
    return isAlive && isInBounds;
  });

  // Оновлення піратів
  const orbitDistance = 15;
  const orbitSpeed = 0.02; // Радіан за тік

  gameState.pirates = gameState.pirates.filter(pirate => {
    const dx_base = pirate.x - BASE_X;
    const dy_base = pirate.y - BASE_Y;
    const distanceToBase = Math.sqrt(dx_base * dx_base + dy_base * dy_base);

    if (distanceToBase <= orbitDistance) {
      pirate.state = 'circling';
    }

    if (pirate.state === 'approaching') {
      pirate.x += pirate.vx;
      pirate.y += pirate.vy;
    } else { // circling
      // Рух по орбіті
      pirate.orbitAngle += orbitSpeed;
      pirate.x = BASE_X + Math.cos(pirate.orbitAngle) * orbitDistance;
      pirate.y = BASE_Y + Math.sin(pirate.orbitAngle) * orbitDistance;

      // Атака на базу
      if (now - pirate.lastAttackTime >= 2000) { // 1 атака на 2 секунди
        gameState.base.hp = Math.max(0, gameState.base.hp - 1);
        pirate.lastAttackTime = now;
        // Створюємо снаряд пірата
        gameState.pirateProjectiles.push({
          id: `p_${nextProjectileId++}`,
          startX: pirate.x,
          startY: pirate.y,
          endX: BASE_X,
          endY: BASE_Y,
          duration: 1000 // Тривалість польоту 1с
        });
      }
    }

    // Перевіряємо, чи пірат ще живий
    if (pirate.hp <= 0) {
      // Розраховуємо шанс випадіння з урахуванням покращень
      const baseDropChance = 0.1; // 10%
      const currentDropChance = baseDropChance * (1 + gameState.science.upgrades.wreckageDropChance.level * 0.1);
      if (Math.random() <= currentDropChance) {
        gameState.resourceChunks.push({
          id: nextChunkId++,
          x: pirate.x,
          y: pirate.y,
          resourceType: 'shipWreckage',
          amount: 1 // 1 одиниця металолому
        });
      }
      gameState.wave.piratesRemaining--;
      return false; // Видаляємо пірата
    }

    // Залишаємо пірата в грі
    return true;
  });

  // Оновлюємо стан хвиль
  managePirateWaves();

  // Видалення снарядів, які вже долетіли
  gameState.projectiles = gameState.projectiles.filter(p => {
    // Якщо снаряд щойно створений, йому ще не присвоєно startTime.
    // Присвоюємо його при першій ітерації після створення.
    if (!p.startTime) {
      p.startTime = now;
    }
    return (now - p.startTime) < p.duration;
  });

  // Видалення піратських снарядів
  gameState.pirateProjectiles = gameState.pirateProjectiles.filter(p => {
    if (!p.startTime) {
      p.startTime = now;
    }
    return (now - p.startTime) < p.duration;
  });

  // Видалення застарілих ефектів ремонту
  const effectDuration = 2000; // 2 секунди
  gameState.repairEffects = gameState.repairEffects.filter(effect => (now - effect.startTime) < effectDuration);

  // --- Логіка ремонтного дрона ---
  const repairDrone = gameState.repairDrone;
  const repairTimeMs = 10000; // 10 секунд

  if (repairDrone.status === 'idle') {
    // Перевіряємо, чи потрібен ремонт і чи є ресурси
    if (gameState.base.hp <= gameState.base.maxHp - 10 && gameState.playerResources.metal >= 1) {
      gameState.playerResources.metal -= 1; // Споживаємо метал
      repairDrone.status = 'repairing';
      repairDrone.startTime = now;
    }
  } else if (repairDrone.status === 'repairing') {
    // Перевіряємо, чи завершено ремонт
    if (now - repairDrone.startTime >= repairTimeMs) {
      gameState.base.hp = Math.min(gameState.base.maxHp, gameState.base.hp + 10); // Ремонтуємо
      repairDrone.status = 'idle';
      repairDrone.startTime = 0;

      // Додаємо ефект для анімації на клієнті
      gameState.repairEffects.push({
        id: Date.now(),
        startTime: now
      });
    }
  }

  // --- Логіка науки ---
  const hullStudy = gameState.science.hullStudy;
  const studyTimeMs = 10000; // 10 секунд
  
  if (hullStudy.isAutomatic && hullStudy.status === 'idle' && gameState.playerResources.shipWreckage >= 1) {
    gameState.playerResources.shipWreckage -= 1;
    hullStudy.status = 'studying';
    hullStudy.startTime = now;
  } else if (hullStudy.status === 'studying') {
    if (now - hullStudy.startTime >= studyTimeMs) {
      gameState.science.points += 1;
      hullStudy.status = 'idle';
      hullStudy.startTime = 0;
    }
  }


  // --- Логіка заводів ---
  Object.keys(factoryStats).forEach(factoryId => {
    const factory = factoryStats[factoryId];
    const factoryState = gameState.factories[factoryId];

    if (factoryState.status === 'idle') {
      // Якщо завод вільний і є ресурси, починаємо переробку
      if (gameState.playerResources[factory.inputResource] >= 1) {
        gameState.playerResources[factory.inputResource] -= 1; // Забираємо ресурс
        factoryState.status = 'processing';
        factoryState.startTime = now;
      }
    } else if (factoryState.status === 'processing') {
      // Якщо завод працює, перевіряємо, чи не час завершити
      if (now - factoryState.startTime >= factory.processingTimeMs) {
        gameState.playerResources[factory.outputResource] += 1; // Додаємо продукт
        factoryState.status = 'idle';
        factoryState.startTime = 0;
      }
    }
  });


  // --- Логіка добування ресурсів ---
  gameState.miningPulses = []; // Очищуємо масив перед кожним оновленням  
  
  // Обробляємо всі лазери
  Object.keys(miningLaserStats).forEach(laserId => {
    const laser = miningLaserStats[laserId];
    const laserState = gameState.miningLasers[laserId];

    if (laserId === 'shipWreckage') {
      // --- Нова логіка для Магнітного трактора ---
      if (laserState.status === 'idle') {
        let closestScrap = null;
        let minDistance = Infinity;
        gameState.resourceChunks.forEach(chunk => {
          if (chunk.resourceType === 'shipWreckage') {
            const dx = chunk.x - BASE_X;
            const dy = chunk.y - BASE_Y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
              minDistance = distance;
              closestScrap = chunk;
            }
          }
        });

        if (closestScrap) {
          laserState.status = 'mining';
          laserState.targetChunkId = closestScrap.id;
          laserState.startTime = now;
          laserState.pullDuration = minDistance * 1000;
        }
      }

      if (laserState.status === 'mining') {
        const targetChunk = gameState.resourceChunks.find(c => c.id === laserState.targetChunkId);
        if (!targetChunk) {
          laserState.status = 'idle';
          laserState.targetChunkId = null;
          laserState.startTime = 0;
        } else {
          // --- Анімація притягування ---
          const elapsedTime = now - laserState.startTime;
          const pullProgress = Math.min(1, elapsedTime / laserState.pullDuration);

          // Початкові координати уламка (зберігаємо їх при першому захопленні)
          if (!laserState.initialChunkPos) {
            laserState.initialChunkPos = { x: targetChunk.x, y: targetChunk.y };
          }
          targetChunk.x = laserState.initialChunkPos.x + (BASE_X - laserState.initialChunkPos.x) * pullProgress;
          targetChunk.y = laserState.initialChunkPos.y + (BASE_Y - laserState.initialChunkPos.y) * pullProgress;

          gameState.miningPulses.push({ id: targetChunk.id, endX: targetChunk.x, endY: targetChunk.y, type: 'shipWreckage' });
          if (now - laserState.startTime >= laserState.pullDuration) {
            gameState.playerResources.shipWreckage += targetChunk.amount;
            targetChunk.amount = 0;
            laserState.status = 'idle';
            laserState.targetChunkId = null;
            laserState.startTime = 0;
            delete laserState.initialChunkPos; // Очищуємо початкову позицію
          }
        }
      }
    } else {
      // --- Стара логіка для звичайних лазерів (лід, руда) ---
      if (laserState.status === 'idle') {
        let closestChunk = null;
        let minDistance = Infinity;
        gameState.resourceChunks.forEach(chunk => {
          if (chunk.resourceType === laser.resourceType) {
            const dx = chunk.x - BASE_X;
            const dy = chunk.y - BASE_Y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= laser.range && distance < minDistance) {
              minDistance = distance;
              closestChunk = chunk;
            }
          }
        });
        if (closestChunk) {
          laserState.status = 'mining';
          laserState.targetChunkId = closestChunk.id;
          laserState.startTime = now;
        }
      }
      if (laserState.status === 'mining') {
        const targetChunk = gameState.resourceChunks.find(c => c.id === laserState.targetChunkId);
        if (!targetChunk || Math.sqrt(Math.pow(targetChunk.x - BASE_X, 2) + Math.pow(targetChunk.y - BASE_Y, 2)) > laser.range) {
          laserState.status = 'idle';
          laserState.targetChunkId = null;
          laserState.startTime = 0;
        } else {
          gameState.miningPulses.push({ id: targetChunk.id, endX: targetChunk.x, endY: targetChunk.y, type: targetChunk.resourceType });
          if (now - laserState.startTime >= laser.miningIntervalMs) {
            targetChunk.amount -= 1;
            gameState.playerResources[targetChunk.resourceType] += 1;
            laserState.startTime = now;
          }
        }
      }
    }
  });

  // Видаляємо уламки, в яких закінчились ресурси
  gameState.resourceChunks = gameState.resourceChunks.filter(chunk => chunk.amount > 0);

  broadcastGameState(); // Надсилаємо оновлений стан усім гравцям
}, 50); // Оновлення ~20 разів на секунду

server.listen(port, hostname, () => {
  console.log(`Сервер запущено та працює за адресою http://${hostname}:${port}/`);
});
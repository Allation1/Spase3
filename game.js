const gameMap = document.getElementById('game-map');
const asteroidsOnScreen = new Map();

// --- Обробники інтерфейсу ---
const BASE_X = 50; // Координата X бази (центр карти)
const BASE_Y = 50; // Координата Y бази (центр карти)
const armamentButton = document.getElementById('armament-button');
const armamentList = document.getElementById('armament-list');
const resourcesButton = document.getElementById('resources-button');
const resourcesList = document.getElementById('resources-list');
const factoriesButton = document.getElementById('factories-button');
const factoriesList = document.getElementById('factories-list');
const miningButton = document.getElementById('mining-button');
const miningList = document.getElementById('mining-list');

// --- Логіка вкладок ---
document.querySelectorAll('#resources-list .tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const parent = button.closest('#resources-list');
        const tabName = button.dataset.tab;

        // Оновлюємо кнопки
        parent.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Оновлюємо вміст
        parent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');
    });
});

armamentButton.addEventListener('click', () => {
    // Сховати інші вкладки
    miningList.classList.add('hidden');
    // Показати/сховати поточну
    armamentList.classList.toggle('hidden');
});

resourcesButton.addEventListener('click', () => {
    // Сховати інші вкладки
    factoriesList.classList.add('hidden');
    // Показати/сховати поточну
    resourcesList.classList.toggle('hidden');
});

factoriesButton.addEventListener('click', () => {
    // Сховати інші вкладки
    // Сховати інші вкладки в цій панелі
    resourcesList.classList.add('hidden');
    // Показати/сховати поточну
    factoriesList.classList.toggle('hidden');
});

miningButton.addEventListener('click', () => {
    // Сховати інші вкладки
    armamentList.classList.add('hidden');
    // Показати/сховати поточну
    miningList.classList.toggle('hidden');
});

// --- WebSocket логіка ---

// Встановлюємо WebSocket з'єднання
const socket = new WebSocket(`ws://${window.location.host}`);

socket.onopen = () => {
    console.log('WebSocket з\'єднання встановлено.');
};

socket.onerror = (error) => {
    console.error('Помилка WebSocket:', error);
};

// Обробляємо повідомлення від сервера
socket.onmessage = (event) => {
    const gameState = JSON.parse(event.data);
    updateAsteroids(gameState.asteroids);
    updateProjectiles(gameState.projectiles); // Оновлюємо снаряди
    updateResourceChunks(gameState.resourceChunks); // Оновлюємо уламки ресурсів
    updatePlayerResources(gameState.playerResources); // Оновлюємо ресурси гравця
    updateMiningPulses(gameState.miningPulses); // Малюємо імпульси добування
};

function updateAsteroids(serverAsteroids) {
    const serverIds = new Set(serverAsteroids.map(a => a.id));

    // Видаляємо астероїди, яких більше немає на сервері
    for (const [id, element] of asteroidsOnScreen.entries()) {
        if (!serverIds.has(id)) {
            element.remove();
            asteroidsOnScreen.delete(id);
        }
    }

    // Оновлюємо або створюємо астероїди
    serverAsteroids.forEach(asteroid => {
        let element = asteroidsOnScreen.get(asteroid.id);
        if (!element) {
            element = document.createElement('div');
            element.className = 'asteroid';
            gameMap.appendChild(element);
            asteroidsOnScreen.set(asteroid.id, element);

            // Додаємо обробники подій для підказки
            element.addEventListener('mouseenter', () => {
                const tooltip = document.createElement('div');
                tooltip.className = 'asteroid-tooltip';
                let tooltipContent = [];
                if (asteroid.resources.ice > 0) {
                    tooltipContent.push(`Лід: ${asteroid.resources.ice}`);
                }
                if (asteroid.resources.ironOre > 0) {
                    tooltipContent.push(`Залізна руда: ${asteroid.resources.ironOre}`);
                }
                tooltip.innerHTML = tooltipContent.join('<br>'); // Використовуємо innerHTML для переносів рядків
                tooltip.style.left = element.style.left;
                tooltip.style.top = element.style.top;
                element.dataset.tooltipId = `tooltip-${asteroid.id}`;
                tooltip.id = element.dataset.tooltipId;
                gameMap.appendChild(tooltip);
            });

            element.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById(element.dataset.tooltipId);
                if (tooltip) {
                    tooltip.remove();
                }
            });
        }
        element.style.left = `${asteroid.x}%`;
        element.style.top = `${asteroid.y}%`;

        // Оновлюємо позицію підказки, якщо вона існує
        const tooltip = document.getElementById(element.dataset.tooltipId);
        if (tooltip) {
            tooltip.style.left = element.style.left;
            tooltip.style.top = element.style.top;
        }
    });
}

// --- Оновлення снарядів ---
const projectilesOnScreen = new Map();
const resourceChunksOnScreen = new Map();
const miningPulsesOnScreen = new Map();

function updateMiningPulses(serverPulses) {
    const activePulseTypes = new Set(serverPulses.map(p => p.type));

    // 1. Видаляємо промені, які більше не активні
    for (const [id, element] of miningPulsesOnScreen.entries()) {
        if (!activePulseTypes.has(id)) {
            element.remove();
            miningPulsesOnScreen.delete(id);
        }
    }

    // 2. Створюємо або оновлюємо активні промені
    serverPulses.forEach(pulse => {
        let element = miningPulsesOnScreen.get(pulse.type);
        if (!element) {
            element = document.createElement('div');
            element.className = `mining-pulse ${pulse.type}`;
            gameMap.appendChild(element);
            miningPulsesOnScreen.set(pulse.type, element);
        }

        // Розраховуємо довжину та кут
        const dx_percent = pulse.endX - BASE_X;
        const dy_percent = pulse.endY - BASE_Y;
        const mapWidth = gameMap.offsetWidth;
        const mapHeight = gameMap.offsetHeight;
        const dx_px = dx_percent / 100 * mapWidth;
        const dy_px = dy_percent / 100 * mapHeight;
        const lengthPx = Math.sqrt(dx_px * dx_px + dy_px * dy_px);
        const angle = Math.atan2(dy_px, dx_px) * (180 / Math.PI);

        // Оновлюємо стилі
        element.style.left = `${BASE_X}%`;
        element.style.top = `${BASE_Y}%`;
        element.style.width = `${lengthPx}px`;
        element.style.transform = `rotate(${angle}deg)`;
    });
}

function updateProjectiles(serverProjectiles) {
    const serverIds = new Set(serverProjectiles.map(p => p.id));

    // Оновлюємо або створюємо снаряди
    serverProjectiles.forEach(projectile => {
        let element = projectilesOnScreen.get(projectile.id);
        if (!element) {
            element = document.createElement('div');
            element.className = 'projectile';
            gameMap.appendChild(element);
            projectilesOnScreen.set(projectile.id, element);

            // Початкова позиція снаряда (від бази)
            element.style.left = `${projectile.startX}%`;
            element.style.top = `${projectile.startY}%`;
            element.style.transition = 'none'; // Вимикаємо перехід для початкової позиції

            // Примусово викликаємо reflow, щоб браузер відмалював початкову позицію
            // перед застосуванням анімації.
            element.offsetWidth; 

            // Використовуємо requestAnimationFrame, щоб гарантувати, що браузер
            // спочатку відмалює початкову позицію, а потім запустить анімацію.
            requestAnimationFrame(() => {
                element.style.transition = `left ${projectile.duration}ms linear, top ${projectile.duration}ms linear`;
                element.style.left = `${projectile.endX}%`;
                element.style.top = `${projectile.endY}%`;
            });
            // Встановлюємо таймер на видалення елемента після завершення анімації
            setTimeout(() => {
                element.remove();
                projectilesOnScreen.delete(projectile.id);
            }, projectile.duration);
        }
    });
}

function updateResourceChunks(serverChunks) {
    const serverIds = new Set(serverChunks.map(c => c.id));

    // Видаляємо зібрані уламки
    for (const [id, element] of resourceChunksOnScreen.entries()) {
        if (!serverIds.has(id)) {
            element.remove();
            resourceChunksOnScreen.delete(id);
        }
    }

    // Створюємо нові уламки
    serverChunks.forEach(chunk => {
        if (!resourceChunksOnScreen.has(chunk.id)) {
            const element = document.createElement('div');
            element.className = `resource-chunk ${chunk.resourceType}`;
            element.style.left = `${chunk.x}%`;
            element.style.top = `${chunk.y}%`;
            const resourceName = chunk.resourceType === 'ice' ? 'Лід' : 'Залізна руда';
            element.title = `${resourceName}: ${chunk.amount}`;

            gameMap.appendChild(element);
            resourceChunksOnScreen.set(chunk.id, element);
        }
    });
}

function updatePlayerResources(playerResources) {
    const iceAmountElement = document.querySelector('#resources-list .resource-item:nth-child(1) span:nth-child(2)');
    const ironOreAmountElement = document.querySelector('#basic-resources .resource-item:nth-child(2) span:nth-child(2)');
    const metalAmountElement = document.querySelector('#secondary-resources .resource-item:nth-child(1) span:nth-child(2)');
    const waterAmountElement = document.querySelector('#secondary-resources .resource-item:nth-child(2) span:nth-child(2)');

    if (iceAmountElement) iceAmountElement.textContent = playerResources.ice;
    if (ironOreAmountElement) ironOreAmountElement.textContent = playerResources.ironOre;
    if (metalAmountElement) metalAmountElement.textContent = playerResources.metal;
    if (waterAmountElement) waterAmountElement.textContent = playerResources.water;
}
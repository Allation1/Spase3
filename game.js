const gameMap = document.getElementById('game-map');
const asteroidsOnScreen = new Map();

// --- Обробники інтерфейсу ---
const BASE_X = 50; // Координата X бази (центр карти)
const armamentButton = document.getElementById('armament-button');
const armamentList = document.getElementById('armament-list');
const resourcesButton = document.getElementById('resources-button');
const resourcesList = document.getElementById('resources-list');

armamentButton.addEventListener('click', () => {
    armamentList.classList.toggle('hidden');
});

resourcesButton.addEventListener('click', () => {
    resourcesList.classList.toggle('hidden');
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

function updateResourceChunks(serverChunks) {
    // Ця функція поки що лише створює уламки, не видаляючи їх.
    // У майбутньому тут можна буде додати логіку збору ресурсів.
    serverChunks.forEach(chunk => {
        if (!resourceChunksOnScreen.has(chunk.id)) {
            const element = document.createElement('div');
            element.className = `resource-chunk ${chunk.resourceType}`;
            element.style.left = `${chunk.x}%`;
            element.style.top = `${chunk.y}%`;
            // Можна додати title для простої підказки
            const resourceName = chunk.resourceType === 'ice' ? 'Лід' : 'Залізна руда';
            element.title = `${resourceName}: ${chunk.amount}`;

            gameMap.appendChild(element);
            resourceChunksOnScreen.set(chunk.id, element);
        }
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
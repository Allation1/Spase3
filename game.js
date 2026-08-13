const gameMap = document.getElementById('game-map');
const asteroidsOnScreen = new Map();

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
        }
        element.style.left = `${asteroid.x}%`;
        element.style.top = `${asteroid.y}%`;
    });
}
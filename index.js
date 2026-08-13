const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Вказуємо папку зі статичними файлами (наш корінь C:\g)
app.use(express.static(__dirname));

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущено: http://localhost:${PORT}`);
});
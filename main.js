const http = require('node:http');
const fs = require('node:fs').promises;
const path = require('node:path');
const { program } = require('commander');

// 1. Обробка аргументів командного рядка 
program
  .requiredOption('-h, --host <type>', 'Адреса сервера')
  .requiredOption('-p, --port <type>', 'Порт сервера', parseInt)
  .requiredOption('-c, --cache <type>', 'Шлях до директорії, яка міститиме кешовані файли');

program.parse(process.argv);
const options = program.opts();

const { host, port, cache } = options;
const cacheDir = path.resolve(cache); // Абсолютний шлях до кешу

/**
 * Ініціалізує програму: створює директорію кешу та запускає сервер.
 */
async function initialize() {
    try {
        // 2. Створення директорії кешу, якщо вона не існує 
        await fs.mkdir(cacheDir, { recursive: true });
        console.log(`Cache directory ready at: ${cacheDir}`);
        
        // 3. Запуск веб-сервера [cite: 40]
        const server = http.createServer(requestHandler);
        server.listen(port, host, () => {
            console.log(`Proxy server running at http://${host}:${port}/`);
            console.log(`To stop the server, press Ctrl+C`);
        });

    } catch (error) {
        console.error('Fatal error during initialization:', error.message);
        process.exit(1); // Вихід у разі критичної помилки
    }
}

/**
 * Обробник HTTP-запитів.
 * @param {http.IncomingMessage} req - Об'єкт запиту.
 * @param {http.ServerResponse} res - Об'єкт відповіді.
 */
async function requestHandler(req, res) {
    // Вся логіка Частини 2 і 3 буде тут
    // Наразі просто відповідь ОК
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Proxy Server OK');
}

initialize();
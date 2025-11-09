// main.js - Повний код лабораторної роботи №5

const http = require('node:http');
const fs = require('node:fs').promises; // Для асинхронної роботи з файлами
const path = require('node:path');
const { program } = require('commander');
const superagent = require('superagent'); // Для Частини 3

// --- ЧАСТИНА 1: Параметри командного рядка ---
program
  .requiredOption('-h, --host <type>', 'Адреса сервера')
  .requiredOption('-p, --port <type>', 'Порт сервера', parseInt)
  .requiredOption('-c, --cache <type>', 'Шлях до директорії, яка міститиме кешовані файли');

program.parse(process.argv);
const options = program.opts();

const { host, port, cache } = options;
const cacheDir = path.resolve(cache); // Абсолютний шлях до кешу

// --- ЧАСТИНА 3: Обробка промаху кешу (Cache Miss) ---
/**
 * Обробляє випадок, коли картинки немає в кеші.
 * Робить запит на https://http.cat, кешує результат та надсилає клієнту.
 * @param {http.ServerResponse} res - Об'єкт відповіді.
 * @param {string} statusCode - HTTP статус-код для запиту (наприклад, '200').
 * @param {string} cacheFilePath - Абсолютний шлях до файлу кешу.
 */
async function handleCacheMiss(res, statusCode, cacheFilePath) {
    const remoteUrl = `https://http.cat/${statusCode}`;
    console.log(`[CACHE MISS] Файлу немає. Запит на: ${remoteUrl}`);

    try {
        // 1. Робимо запит на https://http.cat
        const response = await superagent
            .get(remoteUrl)
            .buffer(true) // Отримати відповідь як Buffer
            .parse(superagent.parse.image); // Примусово парсити як зображення
        
        const imageBuffer = response.body;

        // 2. Збереження картинки у кеш
        await fs.writeFile(cacheFilePath, imageBuffer);
        console.log(`[CACHE HIT] Картинка для ${statusCode} успішно закешована.`);

        // 3. Надсилання картинки клієнту (200 OK)
        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': imageBuffer.length
        });
        res.end(imageBuffer);

    } catch (error) {
        // Якщо запит завершився помилкою, проксі-сервер має повернути 404 (Not Found)
        console.error(`[ERROR] Помилка завантаження картинки для ${statusCode}:`, error.message);
        res.writeHead(404, { 'Content-Type': 'text/plain' }); 
        res.end(`Image for ${statusCode} not found on http.cat or fetch failed.`);
    }
}


// --- ЧАСТИНА 2: Обробник HTTP-запитів ---
/**
 * Обробник HTTP-запитів.
 */
async function requestHandler(req, res) {
    // Отримання http-коду з URL шляху (наприклад, /200 -> 200)
    const urlPath = req.url.slice(1); 
    const statusCode = urlPath.split('/')[0];
    const cacheFilePath = path.join(cacheDir, `${statusCode}.jpeg`);
    
    // Перевірка на валідність коду
    if (!statusCode || isNaN(parseInt(statusCode))) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('Invalid HTTP status code in URL path.');
    }

    switch (req.method) {
        /**
         * GET: Отримати картинку з кешу
         */
        case 'GET':
            try {
                // Спроба прочитати з кешу
                const data = await fs.readFile(cacheFilePath);
                console.log(`[CACHE HIT] Картинка для ${statusCode} знайдена у кеші.`);
                
                // Успіх (200 OK)
                res.writeHead(200, { 
                    'Content-Type': 'image/jpeg',
                    'Content-Length': data.length 
                });
                res.end(data);
            } catch (error) {
                // Помилка: Не знайдено
                if (error.code === 'ENOENT') {
                    // Якщо картинку не знайдено у кеші, виконуємо Частину 3
                    await handleCacheMiss(res, statusCode, cacheFilePath); 
                } else {
                    // Інші помилки сервера
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error while reading cache');
                }
            }
            break;

        /**
         * PUT: Записати картинку в кеш
         */
        case 'PUT':
            try {
                const body = [];
                // Картинка міститься у тілі запиту
                for await (const chunk of req) {
                    body.push(chunk);
                }
                const imageBuffer = Buffer.concat(body);

                if (imageBuffer.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    return res.end('Request body is empty.');
                }
                
                await fs.writeFile(cacheFilePath, imageBuffer);
                // Успіх: 201 Created
                res.writeHead(201, { 'Content-Type': 'text/plain' });
                res.end(`Image for ${statusCode} cached successfully.`);

            } catch (error) {
                console.error('Error during PUT:', error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error during caching');
            }
            break;

        /**
         * DELETE: Видалити картинку з кешу
         */
        case 'DELETE':
            try {
                await fs.unlink(cacheFilePath);
                // Успіх: 200 OK
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`Image for ${statusCode} deleted from cache.`);
            } catch (error) {
                // Помилка: Не знайдено
                if (error.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end(`Image for ${statusCode} not found in cache.`);
                } else {
                    console.error('Error during DELETE:', error);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error during deletion');
                }
            }
            break;

        /**
         * Інші методи: 405 Method Not Allowed
         */
        default: 
            res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, PUT, DELETE' });
            res.end('Method not allowed'); 
            break;
    }
}


// --- ЧАСТИНА 1: Ініціалізація та запуск сервера ---
/**
 * Ініціалізує програму: створює директорію кешу та запускає сервер.
 */
async function initialize() {
    try {
        // Створення директорії кешу, якщо її не існує
        await fs.mkdir(cacheDir, { recursive: true });
        console.log(`Cache directory ready at: ${cacheDir}`);
        
        // Запуск вебсервера
        const server = http.createServer(requestHandler);
        server.listen(port, host, () => {
            console.log(`Proxy server running at http://${host}:${port}/`);
            console.log(`To stop the server, press Ctrl+C`);
        });

    } catch (error) {
        console.error('Fatal error during initialization:', error.message);
        process.exit(1);
    }
}

// Запуск програми
initialize();
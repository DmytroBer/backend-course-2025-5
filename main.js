// main.js - Реалізація Частини 1 та 2

const http = require('node:http');
const fs = require('node:fs').promises; //
const path = require('node:path');
const { program } = require('commander');

// --- Частина 1: Налаштування Commander.js ---
program
  .requiredOption('-h, --host <type>', 'Адреса сервера') //
  .requiredOption('-p, --port <type>', 'Порт сервера', parseInt) //
  .requiredOption('-c, --cache <type>', 'Шлях до директорії кешу'); //

program.parse(process.argv);
const options = program.opts();

const { host, port, cache } = options;
const cacheDir = path.resolve(cache);

/**
 * --- Частина 2: Обробник HTTP-запитів ---
 */
async function requestHandler(req, res) {
    // Отримання коду статусу з URL (наприклад, /200 -> 200)
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
        case 'GET': //
            try {
                const data = await fs.readFile(cacheFilePath); //
                // Успіх: 200 OK
                res.writeHead(200, { //
                    'Content-Type': 'image/jpeg', //
                    'Content-Length': data.length 
                });
                res.end(data);
            } catch (error) {
                // Помилка: Не знайдено
                if (error.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' }); //
                    res.end(`Image for ${statusCode} not found in cache.`);
                } else {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error while reading cache');
                }
            }
            break;

        /**
         * PUT: Записати картинку в кеш
         */
        case 'PUT': //
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
                
                await fs.writeFile(cacheFilePath, imageBuffer); //
                // Успіх: 201 Created
                res.writeHead(201, { 'Content-Type': 'text/plain' }); //
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
        case 'DELETE': //
            try {
                await fs.unlink(cacheFilePath);
                // Успіх: 200 OK
                res.writeHead(200, { 'Content-Type': 'text/plain' }); //
                res.end(`Image for ${statusCode} deleted from cache.`);
            } catch (error) {
                // Помилка: Не знайдено
                if (error.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' }); //
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
            res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, PUT, DELETE' }); //
            res.end('Method not allowed'); 
            break;
    }
}


/**
 * --- Частина 1: Ініціалізація та запуск сервера ---
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
        });

    } catch (error) {
        console.error('Fatal error during initialization:', error.message);
        process.exit(1);
    }
}

// Запуск програми
initialize();
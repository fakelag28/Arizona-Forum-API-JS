# Arizona-Forum-API-JS

JS библиотека для взаимодействия с форумом Arizona RP (forum.arizona-rp.com) без необходимости получения API ключа.

## Установка

```bash
npm install arizona-forum-api-js
```

## Использование

```javascript
const ArizonaAPI = require('arizona-forum-api-js');

async function main() {
    const api = new ArizonaAPI(
        'UserAgent',
        {
            'xf_tra_trust': '-',
            'xf_user': '-',
            'xf_session': '-'
            // Ваши cookie
        }
    );

    try {
        await api.connect();

        // Получение информации о текущем пользователе
        const currentMember = await api.getCurrentMember();
        console.log('Текущий пользователь:', currentMember);

        // Получение информации о пользователе по ID
        const member = await api.getMember(123);
        console.log('Информация о пользователе:', member);

        // Получение информации о теме по ID
        const thread = await api.getThread(456);
        console.log('Информация о теме:', thread);

        // Получение информации о посте по ID
        const post = await api.getPost(789);
        console.log('Информация о посте:', post);

        // Получение информации о категории по ID
        const category = await api.getCategory(10);
        console.log('Информация о категории:', category);

        // Получение списка тем в категории
        const threads = await api.getThreads(10);
        console.log('Список тем:', threads);

    } catch (error) {
        console.error('Ошибка:', error.message);
    }
}

main();
```

## Описание файлов

*   [`src/bypass.js`](src/bypass.js): Файл, содержащий логику для обхода защиты от ботов.
*   [`src/constants.js`](src/constants.js): Файл, содержащий константы, такие как URL форума.
*   [`src/exceptions.js`](src/exceptions.js): Файл, содержащий определения пользовательских исключений.
*   [`src/index.js`](src/index.js): Основной файл библиотеки, содержащий класс `ArizonaAPI`.
*   [`src/models/`](src/models/): Каталог, содержащий модели данных.
    *   [`src/models/Category.js`](src/models/Category.js): Модель категории форума.
    *   [`src/models/Member.js`](src/models/Member.js): Модель пользователя форума.
    *   [`src/models/Post.js`](src/models/Post.js): Модель поста форума.
    *   [`src/models/Thread.js`](src/models/Thread.js): Модель темы форума.

## Модели

Библиотека предоставляет следующие модели данных:

*   `Category`: Представляет категорию форума.
*   `Member`: Представляет пользователя форума.
*   `Post`: Представляет пост форума.
*   `Thread`: Представляет тему форума.

## Методы

Класс `ArizonaAPI` предоставляет следующие методы:

*   `connect(doBypass = true)`: Подключается к форуму и получает CSRF токен.
*   `getCurrentMember()`: Получает информацию о текущем пользователе.
*   `getMember(userId)`: Получает информацию о пользователе по ID.
*   `getThread(threadId)`: Получает информацию о теме по ID.
*   `getPost(postId)`: Получает информацию о посте по ID.
*   `getCategory(categoryId)`: Получает информацию о категории по ID.
*   `getThreads(categoryId, page = 1)`: Получает список тем в категории.

## Документация

Официальная документация доступна по адресу:
https://docs.fakelag.tech/arz_forum_api_js/general-info

## Лицензия

[MIT](LICENSE)

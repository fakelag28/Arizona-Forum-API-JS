const axios = require('axios');
const cheerio = require('cheerio');
const MAIN_URL = require('./constants');
const { bypassAntibot } = require('./bypass');
const { IncorrectLoginData, ThisIsYouError } = require('./exceptions');
const Member = require('./models/Member');
const Post = require('./models/Post');
const Thread = require('./models/Thread');
const Category = require('./models/Category');

class ArizonaAPI {
    constructor(userAgent, cookies) {
        this.userAgent = userAgent;
        this.cookies = cookies;
        this.token = null;
        this.axiosInstance = null;
    }

    async connect(doBypass = true) {
        try {
            let cookieString = '';
            if (this.cookies && typeof this.cookies === 'object') {
                cookieString = Object.entries(this.cookies)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('; ');
            }

            if (doBypass) {
                const { cookie, userAgent } = await bypassAntibot(this.userAgent);
                if (cookieString) {
                    cookieString += '; ' + cookie;
                } else {
                    cookieString = cookie;
                }
                this.userAgent = userAgent;
            }

            this.axiosInstance = axios.create({
                headers: {
                    'User-Agent': this.userAgent,
                    'Cookie': cookieString
                }
            });

            const mainResponse = await this.axiosInstance.get(`${MAIN_URL}/account/`);
            const $ = cheerio.load(mainResponse.data);
            const htmlTag = $('html');
            
            if (!htmlTag.length || htmlTag.attr('data-logged-in') !== 'true') {
                throw new IncorrectLoginData('Неверные данные для входа');
            }

            const termsResponse = await this.axiosInstance.get(`${MAIN_URL}/help/terms/`);
            const $terms = cheerio.load(termsResponse.data);
            this.token = $terms('html').attr('data-csrf');

            if (!this.token) {
                throw new Error('Не удалось получить CSRF токен');
            }
        } catch (error) {
            this.axiosInstance = null;
            if (error instanceof IncorrectLoginData) {
                throw error;
            }
            
            console.error('Детали ошибки:', {
                message: error.message,
                url: error.config?.url,
                headers: error.config?.headers,
                status: error.response?.status,
                statusText: error.response?.statusText
            });
            
            throw new Error(`Ошибка подключения или авторизации: ${error.message}`);
        }
    }

    async getCurrentMember() {
        if (!this.axiosInstance) {
            throw new Error('Сессия не активна. Вызовите connect() сначала.');
        }

        try {
            const response = await this.axiosInstance.get(`${MAIN_URL}/account/`);
            const $ = cheerio.load(response.data);
            const avatarSpan = $('.avatar--xxs');
            
            if (!avatarSpan.length || !avatarSpan.attr('data-user-id')) {
                throw new Error('Не удалось получить ID пользователя');
            }

            const userId = parseInt(avatarSpan.attr('data-user-id'));
            const currentMember = await this.getMember(userId);

            return currentMember
        } catch (error) {
            throw new Error(`Ошибка при получении информации о текущем пользователе: ${error.message}`);
        }
    }

    async getMember(userId) {
        if (!this.axiosInstance) {
            throw new Error('Сессия не активна. Вызовите connect() сначала.');
        }

        try {
            const response = await this.axiosInstance.get(`${MAIN_URL}/members/${userId}/`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const $ = cheerio.load(response.data.html || response.data);
            const userElem = $('.memberHeader-main');
            
            if (!userElem.length) {
                return null;
            }

            const username = $('.memberHeader-name .username').text().trim();
            const role = $('.userTitle').text().trim();
            const roles = [];
            const rolesContainer = $('.memberHeader-banners');
            if (rolesContainer.length) {
                rolesContainer.contents().each((i, elem) => {
                    const text = $(elem).text().trim();
                    if (text && text !== '\n') {
                        roles.push(text);
                    }
                });
            }
            const messageCount = parseInt($('.memberHeader-stats .pairs dd').eq(0).text().replace(/,/g, ''));
            const reactionScore = parseInt($('.memberHeader-stats .pairs dd').eq(1).text().replace(/,/g, ''));
            const trophyPoints = parseInt($('.memberHeader-stats .pairs dd').eq(2).text().replace(/,/g, ''));
            const lastActivityElem = $('.memberHeader-blurb time');
            const lastActivity = lastActivityElem.length ? new Date(lastActivityElem.attr('datetime')) : new Date();
            
            const memberData = {
                userId,
                username,
                role,
                roles,
                messageCount: isNaN(messageCount) ? 0 : messageCount,
                reactionScore: isNaN(reactionScore) ? 0 : reactionScore,
                trophyPoints: isNaN(trophyPoints) ? 0 : trophyPoints,
                lastActivity
            };

            Object.keys(memberData).forEach(key => {
                if (memberData[key] === undefined) {
                    delete memberData[key];
                }
            });

            return new Member(memberData);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            throw new Error(`Ошибка при получении информации о пользователе: ${error.message}`);
        }
    }

    async getThread(threadId) {
        if (!this.axiosInstance) {
            throw new Error('Сессия не активна. Вызовите connect() сначала.');
        }

        try {
            const response = await this.axiosInstance.get(`${MAIN_URL}/threads/${threadId}/`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const $ = cheerio.load(response.data.html || response.data);
            
            if ($('.error').length > 0) {
                return null;
            }

            const title = $('.p-title-value').text().trim();
            const creatorLink = $('.p-body-header .username, .message-attribution .username').first();
            if (!creatorLink.length || !creatorLink.attr('data-user-id')) {
                throw new Error('Не удалось найти информацию об авторе темы');
            }
            
            const creatorId = parseInt(creatorLink.attr('data-user-id'));
            let creator = null;
            
            try {
                creator = await this.getMember(creatorId);
            } catch (e) {
                console.warn(`Ошибка получения автора темы: ${e.message}`);
                creator = new Member({
                    id: creatorId,
                    username: creatorLink.text().trim()
                });
            }
            const date = $('.message-attribution-main time').first().attr('datetime');
            const breadcrumbLinks = $('.p-breadcrumbs li a[href*="/forums/"]');
            const categoryHref = breadcrumbLinks.length ? 
                breadcrumbLinks.last().attr('href') : window.location.pathname;
            const categoryId = parseInt((categoryHref.match(/forums\/(\d+)/) || [])[1]);

            const posts = [];
            $('.message--post').each((i, elem) => {
                const postId = parseInt($(elem).attr('data-content').match(/post-(\d+)/)[1]);
                posts.push(postId);
            });

            const replyCount = posts.length - 1;
            const isLocked = $('dl.blockStatus').length > 0;

            return new Thread({
                threadId,
                title,
                author: creator,
                date: new Date(date),
                categoryId,
                posts,
                replyCount,
                isLocked
            });
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            throw new Error(`Ошибка при получении информации о теме: ${error.message}`);
        }
    }

    async getPost(postId) {
        if (!this.axiosInstance) {
            throw new Error('Сессия не активна. Вызовите connect() сначала.');
        }

        try {
            const response = await this.axiosInstance.get(`${MAIN_URL}/posts/${postId}/`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const $ = cheerio.load(response.data.html || response.data);

            const postElem = $(`div.message--post[data-content="post-${postId}"], article#js-post-${postId}`).first();
            
            if (!postElem.length) {
                return null;
            }

            let creator = null;
            const creatorLink = postElem.find('.message-attribution-main a.username, .message-user a.username, a[data-xf-init="member-tooltip"]').first();
            
            if (!creatorLink.length || !creatorLink.attr('data-user-id')) {
                return null;
            }

            const creatorId = parseInt(creatorLink.attr('data-user-id'));
            const creatorUsername = creatorLink.text().trim();

            try {
                creator = await this.getMember(creatorId);
            } catch (e) {
                console.warn(`Ошибка о получении данных создателя поста ${creatorId}: ${e.message}`);
                creator = new Member({ id: creatorId, username: creatorUsername });
            }

            if (!creator) {
                creator = new Member({ id: creatorId, username: creatorUsername });
            }

            let thread = null;
            const htmlTag = $('html');
            const threadIdAttr = htmlTag.attr('data-content-key');

            if (threadIdAttr && threadIdAttr.startsWith('thread-')) {
                try {
                    const threadId = parseInt(threadIdAttr.replace('thread-', ''));
                    thread = await this.getThread(threadId);
                } catch (e) {
                    console.error(`Ошибка получения темы для поста ${postId}: ${e.message}`);
                }
            }

            if (!thread) {
                console.error(`Не удалось получить информацию о теме для поста ${postId}`);
                return null;
            }
            const createDateElem = postElem.find('time.u-dt, .message-attribution-main time').first();
            const createDate = createDateElem.length ? new Date(createDateElem.attr('datetime')) : null;

            const bbWrapper = postElem.find('.bbWrapper').first();
            const htmlContent = bbWrapper.html() || '';
            const textContent = bbWrapper.text().trim() || '';

            return new Post({
                postId,
                creator,
                thread,
                createDate,
                htmlContent,
                textContent
            });

        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            throw new Error(`Ошибка при получении информации о посте: ${error.message}`);
        }
    }

    async getCategory(categoryId) {
        if (!this.axiosInstance) {
            throw new Error('Сессия не активна. Вызовите connect() сначала.');
        }

        try {
            const response = await this.axiosInstance.get(`${MAIN_URL}/forums/${categoryId}/`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const $ = cheerio.load(response.data.html || response.data);
            
            const title = $('.p-title-value').text().trim();
            const description = $('.p-description').text().trim();

            return new Category({
                categoryId,
                title,
                description
            });
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            throw new Error(`Ошибка при получении информации о категории: ${error.message}`);
        }
    }

    async getThreads(categoryId, page = 1) {
        if (!this.axiosInstance) {
            throw new Error('Сессия не активна. Вызовите connect() сначала.');
        }

        try {
            const response = await this.axiosInstance.get(`${MAIN_URL}/forums/${categoryId}/page-${page}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const $ = cheerio.load(response.data.html || response.data);
            const pinnedThreads = [];
            const regularThreads = [];

            $('div[class^="structItem structItem--thread"]').each((i, elem) => {
                const $elem = $(elem);
                const $title = $elem.find('.structItem-title a').last();
                const href = $title.attr('href') || '';
                const threadIdMatch = href.match(/\/(\d+)\//);
                
                if (!threadIdMatch) return;
                
                const threadId = parseInt(threadIdMatch[1]);
                const isPinned = $elem.find('i[title="Закреплено"]').length > 0;

                if (isPinned) {
                    pinnedThreads.push(threadId);
                } else {
                    regularThreads.push(threadId);
                }
            });

            return {
                pinned: pinnedThreads,
                regular: regularThreads
            };
        } catch (error) {
            throw new Error(`Ошибка при получении списка тем: ${error.message}`);
        }
    }
}

module.exports = ArizonaAPI;

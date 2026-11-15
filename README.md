This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# neon-tattoo-next
# neon-tattoo-next

## IndexNow

Домен задан обычной константой `DOMAIN_URL` в `src/lib/config.ts`.
Next.js и скрипт IndexNow используют это значение; переменные окружения для домена и ключа не нужны.

Ключ не требует переменной окружения: скрипт находит его в `public/<ключ>.txt`.
Должен существовать ровно один такой файл: имя без `.txt` и содержимое должны
точно совпадать, без перевода строки. Ключ — 8–128 символов: a-z, A-Z, 0-9 и дефис.
Другие текстовые файлы игнорируются. Файл подтверждения публичный по назначению.
При смене ключа замените старый файл в `public/` новым и опубликуйте его.
Скрипт проверяет локальный и публичный файлы и прекращает отправку при несовпадении.

```bash
pnpm build                       # next build --webpack, затем IndexNow при успехе
pnpm indexnow                    # повторная отправка после публикации
INDEXNOW_DRY_RUN=1 pnpm build     # проверка сборки и автозапуска без сетевых запросов IndexNow
pnpm indexnow --dry-run          # локальные sitemap и HTML из готовой сборки; без сети
pnpm indexnow --dry-run --online # GET публичного ключа/страниц; без POST в IndexNow
pnpm test:indexnow               # тесты с подменой fetch; реальные отправки исключены
```

Автозапуск добавлен непосредственно в `build` через `&&`: он не зависит от настройки
pnpm `enablePrePostScripts` и не выполняется после неудачной сборки. Ошибка IndexNow
логируется и не меняет успешный код завершения сборки. Если сборка выполняется раньше
деплоя, публичный ключ может ещё отсутствовать: после публикации запустите `pnpm indexnow`
в production-окружении с тем же доменом. В CI это отдельный шаг после успешного деплоя.

Используется существующий `/sitemap.xml`: сначала результат Next.js-сборки
`.next/server/app/**/*.body`, затем `out/` и `public/`, при отсутствии — публичный sitemap.
Поддерживаются sitemap index, вложенность и циклы; внешние sitemap и URL отбрасываются.
Новый генератор sitemap не добавляется. Динамический sitemap можно проверить после
деплоя через `--dry-run --online`; локальный dry-run пропускает страницы без готового HTML.

Перед реальной отправкой проверяются HTTPS-файл ключа и доступность HTML каждой страницы,
`X-Robots-Tag`, robots/bingbot meta и canonical. Дубликаты, API, административные,
служебные URL, ошибки и редиректы исключаются. Локальный dry-run проверяет HTML сборки,
но не видит заголовков и ограничений хостинга. Существующий `robots.ts` разрешает обход сайта.
Отправка идёт в [официальный IndexNow API](https://www.indexnow.org/documentation)
пакетами до 10 000 URL, с таймаутом 10 секунд на запрос и двумя повторами
при сетевых ошибках/временных HTTP-ошибках, с учётом `Retry-After` (ожидание до 10 секунд).

Localhost, IP-адреса, тестовые и типовые preview-домены блокируются. Для Vercel и Netlify
проверяются `VERCEL_ENV`/`VERCEL_TARGET_ENV` и `CONTEXT`; при наличии `DEPLOY_ENV` требуется
значение `production`. На Cloudflare Pages требуется совпадение `CF_PAGES_BRANCH` с
явно заданным `CF_PAGES_PRODUCTION_BRANCH`. При собственном CI задавайте `DEPLOY_ENV=preview`
для preview-задач: скрипт не может распознать произвольную preview-среду без её признаков.

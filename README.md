<p align="center">
  <img src="./client/public/Banner.png" alt="Streamify Web Player banner" width="100%" />
</p>

<h1 align="center">Streamify Web Player</h1>

<p align="center">
  A polished multi-source music player built with Next.js and Express for discovery, playback, lyrics, and local library management.
</p>

<p align="center">
  <a href="#english">English</a> |
  <a href="#فارسی">فارسی</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Express-5-111111?style=for-the-badge&logo=express" alt="Express 5" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Playback-HLS%20%7C%20Native%20Audio%20%7C%20SoundCloud-6C47FF?style=flat-square" alt="Playback support" />
  <img src="https://img.shields.io/badge/Locales-English%20%7C%20Persian-0F766E?style=flat-square" alt="Bilingual UI" />
  <img src="https://img.shields.io/badge/Workspace-Client%20%2B%20Server-2563EB?style=flat-square" alt="Client and server workspace" />
  <img src="https://img.shields.io/badge/License-Source--Available-B91C1C?style=flat-square" alt="Source-available license" />
</p>

## English

### Overview

Streamify Web Player is a desktop-first listening experience that brings together multi-provider search, rich playback controls, artist and collection pages, synced session state, local library management, and timed lyrics in one modern web interface.

### Why It Stands Out

| Area | What you get |
| --- | --- |
| Discovery | Unified search across YouTube, YouTube Music, SoundCloud, and JioSaavn |
| Playback | Queue management, repeat modes, seek, volume, fullscreen, and provider-aware playback |
| Library | Liked songs, custom playlists, recently played tracks, and local persistence |
| Context | Artist pages, collection pages, caching, and playback state recovery |
| UX | Desktop-focused layout, mini player, side panels, and bilingual UI |
| Lyrics | Timed lyrics support for a more immersive fullscreen player experience |

### Tech Stack

- Frontend: `Next.js 16`, `React 19`, `TypeScript`, `Tailwind CSS 4`
- Backend: `Express 5`, `TypeScript`, `Undici`
- Media: native browser audio, `hls.js`, SoundCloud widget playback, DRM and proxy routes
- State and persistence: React contexts, `localStorage`, runtime config bootstrapping, client-side caching

### Architecture Snapshot

```text
.
|-- client/   Next.js app, routes, UI components, playback logic, local library, API endpoints
|-- server/   Express service that aggregates and normalizes provider search responses
|-- cloudflare-api/   Cloudflare Worker backend for the preview-first backend separation migration
|-- README.md
|-- LICENSE
```

### Migration Notes

- Cloudflare Worker backend migration and deployment notes live in `docs/cloudflare-backend-migration.md`

### Main Product Areas

- `client/app/page.tsx`: home experience and recommendation surfaces
- `client/app/search`: multi-source search flow and results UI
- `client/app/library`: liked songs, playlists, and local library interactions
- `client/app/artist` and `client/app/collection`: detail pages for artists and collections
- `client/app/contexts/AudioContext.tsx`: queue, repeat, playback, persistence, and player state
- `client/app/api`: provider proxy routes, auth utilities, lyrics, library sync, and media endpoints
- `server/src/api/search/route.ts`: backend search aggregation entry point

### Quick Start

#### Prerequisites

- `Node.js 20+`
- `npm`

#### Install Dependencies

```bash
npm run install:all
```

#### Start Development

```bash
npm run dev
```

This boots:

- the Next.js client in `client/`
- the Express service in `server/`

Typical local addresses:

- Client: `http://localhost:3000`
- Server: `http://localhost:3001`

### Scripts

| Scope | Command | Description |
| --- | --- | --- |
| Root | `npm run dev` | Start client and server together |
| Root | `npm run dev:client` | Start only the Next.js app |
| Root | `npm run dev:server` | Start only the Express service |
| Root | `npm run build` | Build both workspaces |
| Root | `npm run install:all` | Install root, client, and server dependencies |
| Client | `npm run dev --prefix client` | Run the Next.js app in development |
| Client | `npm run build --prefix client` | Build the client |
| Client | `npm run start --prefix client` | Start the production client build |
| Server | `npm run dev --prefix server` | Run the Express service in development |
| Server | `npm run build --prefix server` | Build the server |
| Server | `npm run start --prefix server` | Start the compiled server |

### Experience Highlights

- Multi-provider streaming workflow with provider-specific routing and playback handling
- Responsive player surfaces including fullscreen player, mini player, and side panels
- Local library and session-aware caching to keep interactions fast and familiar
- English and Persian localization built directly into the app structure
- Modular workspace split that keeps UI concerns and backend aggregation separated

### Contributing

- Issues, pull requests, and documentation updates are welcome in English and Persian
- Conventional Commits in English are preferred for consistency
- Recommended prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`, `test:`

Example:

```text
feat: add mixed search source
fix: keep player loading during provider fallback
docs: refresh README presentation and usage notes
```

### License And Usage

This repository is source-available, not open-source. You may not copy, modify, redistribute, sublicense, sell, host, republish, or publish this application or substantial parts of it without prior written permission from the copyright holder.

See `LICENSE` for the full terms.

---

## فارسی

### معرفی

استریمیفای وب پلیر یک تجربه پخش موسیقی مدرن و مناسب دسکتاپ است که جستجوی چندمنبعه، پخش پیشرفته، متن زمان بندی شده آهنگ، مدیریت صف، صفحه هنرمند و کالکشن، و کتابخانه محلی را در یک رابط یکپارچه کنار هم قرار می دهد.

### چرا این پروژه خاص است

| بخش | توضیح |
| --- | --- |
| جستجو | جستجوی یکپارچه بین YouTube و YouTube Music و SoundCloud و JioSaavn |
| پخش | مدیریت صف، حالت های تکرار، جابجایی زمانی، کنترل صدا، و حالت تمام صفحه |
| کتابخانه | آهنگ های پسندیده، پلی لیست های سفارشی، تاریخچه پخش، و نگه داری محلی داده ها |
| بافت محتوا | صفحه هنرمند، صفحه کالکشن، کش سمت کلاینت، و بازیابی وضعیت پخش |
| تجربه کاربری | طراحی دسکتاپ محور، مینی پلیر، سایدپنل ها، و رابط دوزبانه |
| متن آهنگ | پشتیبانی از متن زمان بندی شده برای تجربه بهتر در پلیر تمام صفحه |

### تکنولوژی ها

- فرانت اند: `Next.js 16` و `React 19` و `TypeScript` و `Tailwind CSS 4`
- بک اند: `Express 5` و `TypeScript` و `Undici`
- پخش: صوت بومی مرورگر، `hls.js`، ویجت SoundCloud، و مسیرهای پروکسی و DRM
- وضعیت و ذخیره سازی: React context و `localStorage` و بارگذاری تنظیمات اجرا و کش سمت کلاینت

### نمای معماری

```text
.
|-- client/   اپلیکیشن Next.js و مسیرها و کامپوننت های رابط و منطق پخش و کتابخانه محلی و API endpoints
|-- server/   سرویس Express برای تجمیع و یکسان سازی پاسخ جستجو از منابع مختلف
|-- README.md
|-- LICENSE
```

### بخش های اصلی برنامه

- `client/app/page.tsx`: صفحه اصلی و سطوح پیشنهاد محتوا
- `client/app/search`: جریان جستجو و رابط نتایج چندمنبعه
- `client/app/library`: آهنگ های پسندیده و پلی لیست ها و تعاملات کتابخانه محلی
- `client/app/artist` و `client/app/collection`: صفحه های جزئیات هنرمند و کالکشن
- `client/app/contexts/AudioContext.tsx`: صف، تکرار، پخش، نگه داری وضعیت، و منطق پلیر
- `client/app/api`: مسیرهای پروکسی منابع، احراز هویت، متن آهنگ، همگام سازی کتابخانه، و رسانه
- `server/src/api/search/route.ts`: نقطه ورود تجمیع جستجو در بک اند

### شروع سریع

#### پیش نیازها

- `Node.js 20+`
- `npm`

#### نصب وابستگی ها

```bash
npm run install:all
```

#### اجرای محیط توسعه

```bash
npm run dev
```

این دستور موارد زیر را بالا می آورد:

- کلاینت Next.js در `client/`
- سرویس Express در `server/`

آدرس های معمول در محیط محلی:

- کلاینت: `http://localhost:3000`
- سرور: `http://localhost:3001`

### اسکریپت ها

| محدوده | دستور | توضیح |
| --- | --- | --- |
| ریشه | `npm run dev` | اجرای همزمان کلاینت و سرور |
| ریشه | `npm run dev:client` | اجرای فقط اپلیکیشن Next.js |
| ریشه | `npm run dev:server` | اجرای فقط سرویس Express |
| ریشه | `npm run build` | بیلد هر دو بخش |
| ریشه | `npm run install:all` | نصب وابستگی های ریشه و کلاینت و سرور |
| کلاینت | `npm run dev --prefix client` | اجرای کلاینت در حالت توسعه |
| کلاینت | `npm run build --prefix client` | بیلد کلاینت |
| کلاینت | `npm run start --prefix client` | اجرای نسخه پروداکشن کلاینت |
| سرور | `npm run dev --prefix server` | اجرای سرور در حالت توسعه |
| سرور | `npm run build --prefix server` | بیلد سرور |
| سرور | `npm run start --prefix server` | اجرای نسخه کامپایل شده سرور |

### نکات برجسته تجربه کاربری

- جریان استریم چندمنبعه با هندلینگ اختصاصی برای هر provider
- سطوح مختلف پخش شامل پلیر تمام صفحه و مینی پلیر و پنل های جانبی
- کتابخانه محلی و کش های وابسته به نشست برای تجربه سریع تر و پایدارتر
- بومی سازی انگلیسی و فارسی به صورت داخلی در ساختار برنامه
- تفکیک مناسب workspace بین رابط کاربری و لایه تجمیع بک اند

### مشارکت

- گزارش باگ، Pull Request، و تغییرات مستندات به فارسی و انگلیسی پذیرفته می شود
- برای یکدستی، بهتر است پیام commit ها با Conventional Commits و ترجیحا به انگلیسی نوشته شوند
- پیشوندهای پیشنهادی: `feat:` و `fix:` و `docs:` و `refactor:` و `perf:` و `chore:` و `test:`

نمونه:

```text
feat: add mixed search source
fix: keep player loading during provider fallback
docs: refresh README presentation and usage notes
```

### مجوز و شرایط استفاده

این مخزن متن باز نیست و فقط به صورت source-available ارائه شده است. بدون مجوز کتبی قبلی از صاحب اثر، اجازه کپی، تغییر، بازنشر، توزیع، میزبانی، فروش، یا انتشار این برنامه یا بخش قابل توجهی از آن وجود ندارد.

برای جزئیات کامل فایل `LICENSE` را ببینید.

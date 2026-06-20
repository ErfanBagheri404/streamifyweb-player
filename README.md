# Streamify Web Player

[English](#english) | [فارسی](#فارسی)

## English

### Overview

Streamify Web Player is a multi-source music player with a Next.js client and an Express-based backend service. It combines search, playback, lyrics, queue management, artist pages, collection pages, and a local library into one desktop-first listening experience.

### Highlights

- Multi-source discovery across YouTube, YouTube Music, SoundCloud, and JioSaavn
- Rich playback with queue controls, repeat modes, seek controls, volume controls, and fullscreen mode
- Local library support for liked songs, custom playlists, and recently played content
- Artist and collection views with client-side caching
- Timed lyrics support in the fullscreen player
- Built-in bilingual UI support with English and Persian locales

### Stack

- Client: Next.js 16, React 19, TypeScript, Tailwind CSS
- Server: Express 5, TypeScript, Undici
- Playback: native audio, HLS, SoundCloud widget playback, DRM proxy routes
- Persistence: React context, localStorage, session-backed client caches

### Workspace Layout

```text
.
|-- client/   Next.js app, UI, API routes, playback logic, local library
|-- server/   Express search service for provider aggregation
|-- README.md
|-- LICENSE
```

### Main App Areas

- `client/app/page.tsx`: home and recommendation surfaces
- `client/app/search`: multi-source search and results
- `client/app/library`: liked songs and local playlists
- `client/app/artist` and `client/app/collection`: detail pages
- `client/app/contexts/AudioContext.tsx`: playback, queue, repeat, and persistence
- `server/src/api/search/route.ts`: backend search aggregation

### Getting Started

#### Prerequisites

- Node.js 20 or newer
- npm

#### Install

```bash
npm run install:all
```

#### Run In Development

```bash
npm run dev
```

This starts:

- the Next.js client in `client/`
- the Express service in `server/`

The Express service usually runs on `http://localhost:3001`. The Next.js app runs on the first available local port, usually `http://localhost:3000`.

### Scripts

#### Root

- `npm run dev`: start client and server together
- `npm run dev:client`: start only the Next.js app
- `npm run dev:server`: start only the Express service
- `npm run build`: build both workspaces
- `npm run install:all`: install dependencies for root, client, and server

#### Client

- `npm run dev --prefix client`
- `npm run build --prefix client`
- `npm run start --prefix client`

#### Server

- `npm run dev --prefix server`
- `npm run build --prefix server`
- `npm run start --prefix server`

### Contribution Notes

- We accept issues, pull requests, and documentation updates in both English and Persian.
- For consistency, commit messages should use Conventional Commits in English when possible.
- Recommended commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`, `test:`.

Examples:

```text
feat: add mixed search source
fix: keep player loading during provider fallback
docs: update bilingual README and license notice
```

### License And Usage

This project is source-available but not open-source. No one may copy, modify, redistribute, sublicense, sell, host, republish, or publish this app or substantial parts of it without prior written permission from the copyright holder.

See the `LICENSE` file for the full terms.

---

## فارسی

### معرفی

استریمیفای وب پلیر یک پخش کننده موسیقی چندمنبعه است که از یک کلاینت `Next.js` و یک سرویس بک اند مبتنی بر `Express` تشکیل شده است. این پروژه جستجو، پخش، متن آهنگ، مدیریت صف، صفحه هنرمند، صفحه کالکشن و کتابخانه محلی را در یک تجربه یکپارچه و مناسب دسکتاپ کنار هم قرار می دهد.

### قابلیت ها

- جستجوی چندمنبعه بین YouTube و YouTube Music و SoundCloud و JioSaavn
- پخش کامل با کنترل صف، حالت های تکرار، جستجوی زمانی، کنترل صدا و حالت تمام صفحه
- کتابخانه محلی شامل آهنگ های لایک شده، پلی لیست های سفارشی و تاریخچه پخش
- صفحه هنرمند و کالکشن با کش سمت کلاینت
- پشتیبانی از متن زمان بندی شده آهنگ در پلیر تمام صفحه
- پشتیبانی داخلی از رابط دوزبانه انگلیسی و فارسی

### تکنولوژی ها

- کلاینت: Next.js 16 و React 19 و TypeScript و Tailwind CSS
- سرور: Express 5 و TypeScript و Undici
- پخش: صوت بومی مرورگر، HLS، ویجت SoundCloud و مسیرهای DRM proxy
- ذخیره سازی: React context و localStorage و کش های موقت سمت کلاینت

### ساختار پروژه

```text
.
|-- client/   اپلیکیشن Next.js و رابط کاربری و API routes و منطق پخش و کتابخانه محلی
|-- server/   سرویس Express برای تجمیع جستجو از منابع مختلف
|-- README.md
|-- LICENSE
```

### بخش های اصلی برنامه

- `client/app/page.tsx`: صفحه اصلی و پیشنهادها
- `client/app/search`: جستجو و نتایج چندمنبعه
- `client/app/library`: آهنگ های پسندیده و پلی لیست های محلی
- `client/app/artist` و `client/app/collection`: صفحه های جزئیات
- `client/app/contexts/AudioContext.tsx`: منطق پخش و صف و تکرار و نگه داری وضعیت
- `server/src/api/search/route.ts`: تجمیع جستجو در بک اند

### شروع سریع

#### پیش نیازها

- Node.js نسخه 20 یا جدیدتر
- npm

#### نصب

```bash
npm run install:all
```

#### اجرای توسعه

```bash
npm run dev
```

این دستور موارد زیر را اجرا می کند:

- کلاینت Next.js در `client/`
- سرویس Express در `server/`

به صورت پیش فرض سرویس Express روی `http://localhost:3001` اجرا می شود و برنامه Next.js معمولا روی `http://localhost:3000` در اولین پورت آزاد بالا می آید.

### اسکریپت ها

#### ریشه پروژه

- `npm run dev`: اجرای همزمان کلاینت و سرور
- `npm run dev:client`: اجرای فقط کلاینت
- `npm run dev:server`: اجرای فقط سرور
- `npm run build`: بیلد هر دو بخش
- `npm run install:all`: نصب وابستگی های ریشه و کلاینت و سرور

#### کلاینت

- `npm run dev --prefix client`
- `npm run build --prefix client`
- `npm run start --prefix client`

#### سرور

- `npm run dev --prefix server`
- `npm run build --prefix server`
- `npm run start --prefix server`

### راهنمای مشارکت

- ما گزارش باگ و Pull Request و تغییرات مستندات را هم به زبان فارسی و هم انگلیسی می پذیریم.
- برای یکدستی پروژه بهتر است پیام commit ها تا حد امکان با Conventional Commits و به زبان انگلیسی نوشته شوند.
- پیشوندهای پیشنهادی برای commit: `feat:` و `fix:` و `docs:` و `refactor:` و `perf:` و `chore:` و `test:`.

نمونه:

```text
feat: add mixed search source
fix: keep player loading during provider fallback
docs: update bilingual README and license notice
```

### مجوز و شرایط استفاده

این پروژه متن باز نیست و فقط source-available است. هیچ شخص یا سازمانی اجازه ندارد بدون مجوز کتبی قبلی از صاحب اثر، این برنامه یا بخش قابل توجهی از آن را کپی کند، تغییر دهد، بازنشر کند، توزیع کند، میزبانی کند، بفروشد یا منتشر کند.

برای جزئیات کامل فایل `LICENSE` را ببینید.

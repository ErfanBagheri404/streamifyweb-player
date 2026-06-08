# Streamify Web Player

Streamify Web Player is a polished multi-source music player built around a Next.js client and a lightweight Express search service. It brings together search, playback, queue management, lyrics, artist and collection views, and a local library layer in a single interface designed for desktop-first listening.

The project focuses on a smooth listening experience rather than a bare search shell. Search results can flow directly into playback, recent listening history drives recommendations on the home screen, and the player includes both a compact miniplayer and a fullscreen listening view.

## Highlights

- Multi-source discovery across YouTube, YouTube Music, SoundCloud, and JioSaavn
- Rich playback flow with queue controls, repeat modes, volume controls, seek controls, and fullscreen playback
- Local library features including liked songs, custom playlists, and recently played content
- Artist and collection pages with cached client-side data for faster revisits
- Timed lyrics support and synchronized lyric display in the fullscreen player
- Theme, language, animation, and playback preferences managed from an in-app settings page
- Bilingual interface support with English and Persian locale files

## Stack

- **Client:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Server:** Express 5, TypeScript, Undici
- **Playback:** native audio, HLS support, SoundCloud widget handling, DRM proxy routes
- **State and persistence:** React context, localStorage, session-backed client caches

## Workspace Layout

```text
.
|-- client/   Next.js application, API routes, UI, playback logic, local library
|-- server/   Express search service for external source aggregation
|-- README.md
```

Within the client app, the main areas are:

- `client/app/page.tsx` for the home experience and recommendation surfaces
- `client/app/search` for multi-source search and results
- `client/app/library` for liked songs and local playlists
- `client/app/artist` and `client/app/collection` for detail pages
- `client/app/contexts/AudioContext.tsx` for playback, queue, repeat, and persistence logic

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm

### Install

```bash
npm run install:all
```

### Run in Development

```bash
npm run dev
```

This starts:

- the Next.js client in `client/`
- the Express server in `server/`

By default, the Express service listens on `http://localhost:3001`. The Next.js app runs on the first available local port, typically `http://localhost:3000`.

## Scripts

### Root

- `npm run dev` starts client and server together
- `npm run dev:client` starts only the Next.js app
- `npm run dev:server` starts only the Express service
- `npm run build` builds both workspaces
- `npm run install:all` installs dependencies for the root, client, and server

### Client

- `npm run dev --prefix client`
- `npm run build --prefix client`
- `npm run start --prefix client`

### Server

- `npm run dev --prefix server`
- `npm run build --prefix server`
- `npm run start --prefix server`

## What the App Covers

### Discovery

- Search across multiple providers with source-aware filters
- Artist pages, channel views, albums, and playlists
- Home recommendations shaped by listening history

### Playback

- Miniplayer and fullscreen player
- Queue navigation, seek, volume, mute, and repeat controls
- Repeat off, repeat queue, and repeat one modes
- Support for different playback backends depending on source

### Personal Library

- Liked songs
- Custom local playlists
- Recently played history
- Stored navigation and search context for smoother return flows

### Preferences

- App theme controls
- Preferred search source
- Language selection
- Animation and playback-related settings

## Development Notes

- The client uses App Router routes under `client/app`, including internal API routes for search, artist, collection, audio proxy, lyrics, and video resolution.
- The Express server provides a dedicated `/search` endpoint for aggregated provider search.
- Several client-facing views use browser storage and short-lived cache layers to reduce repeated fetches for previously visited pages.
- Static icons and fonts are preloaded and cacheable to keep repeated UI interactions lightweight.

## Build

To create a production build for both workspaces:

```bash
npm run build
```

To build only the frontend:

```bash
npm run build --prefix client
```

To build only the backend:

```bash
npm run build --prefix server
```

## License

This repository does not currently declare a project-wide license. Review the individual workspace packages before publishing or distributing it externally.

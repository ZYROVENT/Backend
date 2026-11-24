/**
 * GLauncher Music API (router)
 *
 * Se monta en `/api/music` desde server.js:
 *
 *   GET /api/music/health
 *   GET /api/music/search?q=bad%20bunny&limit=20
 *   GET /api/music/resolve?id=VIDEO_ID
 *   GET /api/music/track/VIDEO_ID
 *   GET /api/music/stream/VIDEO_ID        -> 302 a googlevideo (por defecto)
 *   GET /api/music/stream/VIDEO_ID?proxy=1 -> el servidor reenvía los bytes
 *
 * Resuelve el audio hablando con la API interna de YouTube usando clientes
 * móviles (iOS y Android), que devuelven las URLs ya firmadas. No necesita
 * claves ni descargar nada para buscar.
 */

const express = require('express');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const router = express.Router();

const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${API_KEY}&prettyPrint=false`;
const SEARCH_URL = `https://www.youtube.com/youtubei/v1/search?key=${API_KEY}&prettyPrint=false`;

const TTL_MS = 20 * 60 * 1000;
const MAX_BITRATE = 192000;
const REQUEST_TIMEOUT_MS = 15000;
const CHUNK_BYTES = 1000 * 1000;
const AGENTE_AUDIO =
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

// Orden pensado para servidores (IP de datacenter): los clientes VR y TV
// embebidos son los que YouTube sigue sirviendo sin pedir login.
const CLIENTS = [
    {
        name: 'ANDROID_VR',
        version: '1.62.27',
        userAgent:
            'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1) gzip',
        device: { androidSdkVersion: 32, osName: 'Android', osVersion: '12' }
    },
    {
        name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        version: '2.0',
        userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
        thirdParty: { embedUrl: 'https://www.youtube.com/' }
    },
    {
        name: 'IOS',
        version: '20.10.4',
        userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
        device: { deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' }
    },
    {
        name: 'ANDROID',
        version: '20.10.38',
        userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
        device: { androidSdkVersion: 30, osName: 'Android', osVersion: '11' }
    },
    {
        name: 'WEB_EMBEDDED_PLAYER',
        version: '1.20250310.01.00',
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        thirdParty: { embedUrl: 'https://www.youtube.com/' }
    }
];

const cache = new Map(); // videoId -> { track, expiresAt }

class ApiError extends Error {
    constructor(status, code, details) {
        super(details || code);
        this.status = status;
        this.code = code;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(url, body, userAgent) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const text = await response.text();
    if (!response.ok) {
        throw new ApiError(502, 'youtube_http', `YouTube respondió ${response.status}`);
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new ApiError(502, 'youtube_json', 'YouTube devolvió una respuesta ilegible');
    }
}

function chooseFormat(formats) {
    const isMp4 = (f) => /mp4/i.test(f.mimeType || '');
    const bitrate = (f) => Number(f.bitrate || 0);
    const sorted = [...formats].sort(
        (a, b) =>
            Number(isMp4(b)) - Number(isMp4(a)) ||
            Math.min(bitrate(b), MAX_BITRATE) - Math.min(bitrate(a), MAX_BITRATE)
    );
    return (
        sorted.find((f) => isMp4(f) && bitrate(f) > 0 && bitrate(f) <= MAX_BITRATE) || sorted[0]
    );
}

async function resolveWith(client, videoId) {
    const json = await postJson(
        PLAYER_URL,
        {
            context: {
                client: {
                    clientName: client.name,
                    clientVersion: client.version,
                    hl: 'es',
                    gl: 'ES',
                    ...client.device
                }
            },
            ...(client.thirdParty ? { thirdParty: client.thirdParty } : {}),
            videoId,
            contentCheckOk: true,
            racyCheckOk: true
        },
        client.userAgent
    );

    const status = json && json.playabilityStatus ? json.playabilityStatus.status : '';
    if (status !== 'OK') {
        const reason =
            (json && json.playabilityStatus && json.playabilityStatus.reason) ||
            `YouTube rechazó el vídeo (${status || 'sin estado'})`;
        throw new ApiError(422, 'not_playable', reason);
    }

    const formats = (json.streamingData && json.streamingData.adaptiveFormats) || [];
    const audios = formats.filter(
        (f) => String(f.mimeType || '').startsWith('audio/') && String(f.url || '').startsWith('http')
    );
    if (audios.length === 0) {
        throw new ApiError(422, 'no_audio', 'YouTube no devolvió audio para este vídeo');
    }

    const chosen = chooseFormat(audios);
    const mimeType = String(chosen.mimeType || '').split(';')[0] || 'audio/mp4';
    const details = json.videoDetails || {};

    return {
        videoId,
        title: details.title || '',
        author: details.author || '',
        duration:
            Number(details.lengthSeconds || 0) ||
            Math.round(Number(chosen.approxDurationMs || 0) / 1000),
        url: chosen.url,
        mimeType,
        container: mimeType.includes('mp4') ? 'm4a' : 'webm',
        bitrate: Number(chosen.bitrate || 0),
        contentLength: Number(chosen.contentLength || 0),
        isOpus: /opus|webm/i.test(chosen.mimeType || ''),
        expiresAt: Date.now() + TTL_MS
    };
}

async function resolveAudio(videoId, options) {
    const opts = options || {};
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        throw new ApiError(400, 'invalid_id', 'El id del vídeo no es válido');
    }
    if (opts.force) cache.delete(videoId);

    const hit = cache.get(videoId);
    if (hit && hit.expiresAt > Date.now()) return hit.track;

    let lastError = null;
    for (const client of CLIENTS) {
        try {
            const track = await resolveWith(client, videoId);
            cache.set(videoId, { track, expiresAt: Date.now() + TTL_MS });
            return track;
        } catch (error) {
            lastError = error;
        }
    }
    if (lastError instanceof ApiError) throw lastError;
    throw new ApiError(502, 'no_audio', 'YouTube no devolvió audio para este vídeo');
}

function parseClock(text) {
    if (typeof text !== 'string') return 0;
    const parts = text.split(':').map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
}

function runsText(node) {
    if (!node) return '';
    if (Array.isArray(node.runs) && node.runs.length > 0) return node.runs[0].text || '';
    return node.simpleText || '';
}

function collectVideoRenderers(node, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const item of node) collectVideoRenderers(item, out);
        return;
    }
    if (node.videoRenderer) out.push(node.videoRenderer);
    for (const value of Object.values(node)) collectVideoRenderers(value, out);
}

async function search(query, limit) {
    const clean = String(query || '').trim();
    if (!clean) throw new ApiError(400, 'empty_query', 'Falta el texto a buscar');

    const json = await postJson(
        SEARCH_URL,
        {
            context: {
                client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'es', gl: 'ES' }
            },
            query: clean
        },
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    const renderers = [];
    collectVideoRenderers(json, renderers);

    const seen = new Set();
    const tracks = [];
    for (const renderer of renderers) {
        const id = renderer && renderer.videoId;
        if (typeof id !== 'string' || id.length !== 11 || seen.has(id)) continue;
        seen.add(id);
        tracks.push({
            id,
            title: runsText(renderer.title) || 'Sin título',
            author:
                runsText(renderer.ownerText) ||
                runsText(renderer.longBylineText) ||
                runsText(renderer.shortBylineText) ||
                'YouTube',
            duration: parseClock(renderer.lengthText && renderer.lengthText.simpleText),
            thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
        });
        if (tracks.length >= limit) break;
    }
    return tracks;
}

function parseRangeHeader(header, total) {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
    if (!match) return null;

    const hasStart = match[1] !== '';
    const hasEnd = match[2] !== '';
    if (!hasStart && !hasEnd) return null;

    let start;
    let end;
    if (!hasStart) {
        const suffix = Number(match[2]);
        if (suffix <= 0) return { invalid: true };
        start = Math.max(0, total - suffix);
        end = total - 1;
    } else {
        start = Number(match[1]);
        end = hasEnd ? Math.min(Number(match[2]), total - 1) : total - 1;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
        return { invalid: true };
    }
    return { start, end };
}

function openUpstream(track, start, end) {
    return fetch(track.url, {
        headers: {
            Range: `bytes=${start}-${end}`,
            'User-Agent': AGENTE_AUDIO,
            Referer: 'https://www.youtube.com/',
            Origin: 'https://www.youtube.com'
        },
        redirect: 'follow'
    });
}

async function openChunk(track, videoId, start, end) {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) {
            await sleep(400 * attempt);
            const fresh = await resolveAudio(videoId, { force: true });
            track.url = fresh.url;
        }
        const upstream = await openUpstream(track, start, end);
        if (upstream.status === 403 || upstream.status === 410 || upstream.status === 429) {
            lastStatus = upstream.status;
            if (upstream.body) await upstream.body.cancel().catch(() => {});
            continue;
        }
        if (upstream.status !== 206 && upstream.status !== 200) {
            const status = upstream.status;
            if (upstream.body) await upstream.body.cancel().catch(() => {});
            throw new ApiError(502, 'upstream_failed', `googlevideo respondió ${status}`);
        }
        return upstream;
    }
    throw new ApiError(502, 'upstream_failed', `googlevideo respondió ${lastStatus || 403}`);
}

async function writeChunk(res, upstream) {
    try {
        await pipeline(Readable.fromWeb(upstream.body), res, { end: false });
        return true;
    } catch (e) {
        return false;
    }
}

function baseUrl(req) {
    const configured = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    if (configured) return configured;
    return `${req.protocol}://${req.get('host')}`;
}

function videoIdOf(req) {
    const raw = req.params.id || req.query.id || req.query.v || '';
    return String(raw).replace(/\.(m4a|mp3|webm|aac)$/i, '');
}

router.get('/health', (req, res) => {
    res.json({
        ok: true,
        service: 'glauncher-music-api',
        version: '1.0.0',
        uptime: Math.round(process.uptime())
    });
});

router.get('/search', async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 40);
        const tracks = await search(req.query.q, limit);
        res.json({ count: tracks.length, tracks });
    } catch (error) {
        next(error);
    }
});

router.get('/resolve', async (req, res, next) => {
    try {
        const id = videoIdOf(req);
        const track = await resolveAudio(id, { force: req.query.force === '1' });
        res.json({ ...track, streamUrl: `${baseUrl(req)}/api/music/stream/${id}` });
    } catch (error) {
        next(error);
    }
});

router.get('/track/:id', async (req, res, next) => {
    try {
        const id = videoIdOf(req);
        const track = await resolveAudio(id);
        res.json({
            id: track.videoId,
            title: track.title,
            author: track.author,
            duration: track.duration,
            mimeType: track.mimeType,
            bitrate: track.bitrate,
            streamUrl: `${baseUrl(req)}/api/music/stream/${id}`
        });
    } catch (error) {
        next(error);
    }
});

async function streamHandler(req, res, next) {
    try {
        const id = videoIdOf(req);
        const track = await resolveAudio(id);

        // Por defecto se redirige a la URL ya resuelta: es instantáneo y el
        // reproductor la sigue sin problema. Con `?proxy=1` el servidor
        // reenvía los bytes (YouTube limita a ~1 MB por URL, ver README).
        if (req.query.proxy !== '1') {
            res.set('Cache-Control', 'no-store');
            return res.redirect(track.url);
        }

        const total =
            track.contentLength > 0
                ? track.contentLength
                : await (async () => {
                      const probe = await openUpstream(track, 0, 0);
                      const range = probe.headers.get('content-range');
                      if (probe.body) await probe.body.cancel().catch(() => {});
                      return Number((range && range.split('/')[1]) || probe.headers.get('content-length') || 0);
                  })();

        const requested = parseRangeHeader(req.headers.range, total);
        if (requested && requested.invalid) {
            res.status(416).set('Content-Range', `bytes */${total}`);
            return res.end();
        }

        const start = requested ? requested.start : 0;
        const end = requested ? requested.end : total - 1;

        if (req.method === 'HEAD') {
            res.status(requested ? 206 : 200);
            res.set({
                'Content-Type': track.mimeType,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(end - start + 1)
            });
            if (requested) res.set('Content-Range', `bytes ${start}-${end}/${total}`);
            return res.end();
        }

        let first;
        try {
            first = await openChunk(track, id, start, Math.min(start + CHUNK_BYTES - 1, end));
        } catch (error) {
            const fresh = await resolveAudio(id, { force: true }).catch(() => track);
            res.status(302).set('Cache-Control', 'no-store');
            return res.redirect(fresh.url);
        }

        res.status(requested ? 206 : 200);
        res.set({
            'Content-Type': track.mimeType,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            'Cache-Control': 'public, max-age=3600'
        });
        if (requested) res.set('Content-Range', `bytes ${start}-${end}/${total}`);
        res.flushHeaders();

        let position = start;
        let upstream = first;
        while (position <= end) {
            if (res.destroyed) return;
            const chunkEnd = Math.min(position + CHUNK_BYTES - 1, end);
            if (!upstream) {
                upstream = await openChunk(track, id, position, chunkEnd).catch(() => null);
                if (!upstream) {
                    console.warn('[music] proxy interrumpido a mitad del audio');
                    return res.destroy();
                }
            }
            const moved = await writeChunk(res, upstream);
            upstream = null;
            if (!moved) return;
            position = chunkEnd + 1;
        }
        return res.end();
    } catch (error) {
        next(error);
    }
}

router.get('/stream/:id', streamHandler);
router.get('/stream', streamHandler);

router.use((error, req, res, next) => {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : 'internal_error';
    if (status >= 500) console.error(`[music] ${code}:`, error.message);
    if (res.headersSent) return res.destroy();
    res.status(status).json({ error: code, message: error.message });
});

module.exports = router;
module.exports.resolveAudio = resolveAudio;
module.exports.search = search;

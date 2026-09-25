#!/usr/bin/env node
// Push any audio source into a session using ffmpeg: a file, an RTMP/SRT/HLS stream, or a capture device.
//
//   node tools/ingest.js --session main --input talk.mp3 [--server ws://localhost:8080] [--token X] [--realtime]
//   node tools/ingest.js --session main --input rtmp://host/live/stage1
//   node tools/ingest.js --session main --input "alsa:hw:1,0"      (Linux line-in)
//   node tools/ingest.js --session main --input "dshow:audio=Line In"  (Windows)
//
// Files are paced at 1x (--realtime, default on for files) so the demo behaves like a live stage.
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]] : []).filter(Boolean));
const server = (args.server || process.env.SERVER || 'ws://localhost:8080').replace(/\/$/, '');
const session = args.session;
const input = args.input;
const token = args.token || process.env.INGEST_TOKEN || '';
if (!session || !input) { console.error('usage: --session <id> --input <file|url|device> [--server ws://host:port] [--token T]'); process.exit(1); }

const isStream = /^(rtmp|rtsp|srt|http|https|udp|tcp):/i.test(input);
const isDevice = /^(alsa|pulse|dshow|avfoundation):/i.test(input);
const realtime = args.realtime === true || (!isStream && !isDevice);

let ffArgs = ['-hide_banner', '-loglevel', 'error'];
if (realtime) ffArgs.push('-re');
if (isDevice) { const [fmt, dev] = input.split(/:(.*)/); ffArgs.push('-f', fmt, '-i', dev); }
else ffArgs.push('-i', input);
ffArgs.push('-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1');

const url = `${server}/ws/ingest/${session}?source=ingest${token ? `&token=${encodeURIComponent(token)}` : ''}`;
const ws = new WebSocket(url);
ws.on('open', () => {
  console.log(`[ingest] connected to ${url}`);
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
  const CHUNK = 3200; // 100 ms
  let buf = Buffer.alloc(0), sent = 0;
  ff.stdout.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= CHUNK) { ws.send(buf.subarray(0, CHUNK)); buf = buf.subarray(CHUNK); sent += CHUNK; }
  });
  ff.on('close', (code) => { console.log(`[ingest] ffmpeg exited (${code}), sent ${(sent / 32000).toFixed(1)} s of audio`); setTimeout(() => ws.close(), 3000); });
  ws.on('close', () => ff.kill('SIGTERM'));
});
ws.on('message', (m) => { try { const j = JSON.parse(m); if (j.type === 'ready') console.log(`[ingest] session ${j.session.name} ready`); } catch {} });
ws.on('error', (e) => { console.error('[ingest] ws error', e.message); process.exit(1); });
ws.on('close', () => process.exit(0));

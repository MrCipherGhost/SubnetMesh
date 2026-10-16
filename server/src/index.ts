import express from 'express';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { canJoinChannel, createChannel, hasChannel, listChannels } from './channels.js';

type Member = { id: string; name: string; room: string; voice: boolean; screen: boolean };
type Message = { id: string; name: string; text: string; time: number };
const members = new Map<string, Member>();
const history = new Map<string, Message[]>();
const app = express();
const cert = fileURLToPath(new URL('../../certs/local.pem', import.meta.url));
const key = fileURLToPath(new URL('../../certs/local-key.pem', import.meta.url));
// Development uses Vite HTTPS and an HTTP proxy target.
const tls = process.env.NODE_ENV !== 'development' && existsSync(cert) && existsSync(key);
const server = tls ? httpsServer({ cert: readFileSync(cert), key: readFileSync(key) }, app) : httpServer(app);
const io = new Server(server, { maxHttpBufferSize: 64_000 });
const publicDir = fileURLToPath(new URL('../../client/dist', import.meta.url));
app.use(express.static(publicDir));
app.get('/health', (_req, res) => { res.json({ ok: true }); });

function roster(room: string) {
  io.to(room).emit('room:members', [...members.values()].filter(m => m.room === room));
}
function leave(id: string) {
  const member = members.get(id);
  if (!member) return;
  members.delete(id);
  io.to(member.room).emit('voice:left', id);
  roster(member.room);
}
function emitChannels() {
  io.emit('channels:list', listChannels());
}

io.on('connection', socket => {
  socket.emit('channels:list', listChannels());

  socket.on('channel:create', (data, ack) => {
    if (typeof ack !== 'function') return;
    const name = data && typeof data.name === 'string' ? data.name : '';
    const password = data && typeof data.password === 'string' ? data.password : '';
    const result = createChannel(name, password);
    if (result.error) { ack({ error: result.error }); return; }
    emitChannels();
    ack({ channel: result.channel, channels: listChannels() });
  });

  socket.on('room:join', async (data, ack) => {
    if (typeof ack !== 'function') return;
    if (!data || typeof data.room !== 'string' || typeof data.name !== 'string' || !data.name.trim()) {
      ack({ error: 'Enter a name and select a valid room.' }); return;
    }
    if (!hasChannel(data.room)) { ack({ error: 'Channel not found.' }); return; }
    const gate = canJoinChannel(data.room, typeof data.password === 'string' ? data.password : '');
    if (!gate.ok) { ack({ error: gate.error }); return; }
    const previous = members.get(socket.id);
    if (previous) { await socket.leave(previous.room); leave(socket.id); }
    const member = { id: socket.id, name: data.name.trim().slice(0, 40), room: data.room, voice: false, screen: false };
    members.set(socket.id, member);
    await socket.join(member.room);
    ack({ messages: history.get(member.room) ?? [], channels: listChannels() });
    roster(member.room);
  });
  socket.on('chat:send', (text) => {
    const member = members.get(socket.id);
    if (!member || typeof text !== 'string' || !text.trim() || text.length > 4000) return;
    const message = { id: randomUUID(), name: member.name, text: text.trim(), time: Date.now() };
    const messages = [...(history.get(member.room) ?? []), message].slice(-200);
    history.set(member.room, messages);
    io.to(member.room).emit('chat:message', message);
  });
  socket.on('voice:join', (ack) => {
    const member = members.get(socket.id);
    if (!member || typeof ack !== 'function') return;
    const peers = [...members.values()].filter(m => m.room === member.room && m.voice && m.id !== member.id).map(m => m.id);
    if (peers.length >= 6) { ack({ error: 'Voice room is full (six people maximum).' }); return; }
    member.voice = true;
    ack({ peers });
    roster(member.room);
  });
  socket.on('voice:leave', () => {
    const member = members.get(socket.id);
    if (!member) return;
    member.voice = false;
    member.screen = false;
    socket.to(member.room).emit('voice:left', socket.id);
    roster(member.room);
  });
  socket.on('screen:start', (ack) => {
    const member = members.get(socket.id);
    if (!member || typeof ack !== 'function') return;
    if (!member.voice) { ack({ error: 'Join voice before sharing your screen.' }); return; }
    const other = [...members.values()].find(m => m.room === member.room && m.screen && m.id !== member.id);
    if (other) {
      other.screen = false;
      io.to(other.id).emit('screen:replaced', { by: member.name });
    }
    member.screen = true;
    ack({ ok: true, replaced: other?.name ?? null });
    roster(member.room);
  });
  socket.on('screen:stop', () => {
    const member = members.get(socket.id);
    // Only the active sharer can clear the channel screen slot.
    if (!member?.screen) return;
    member.screen = false;
    roster(member.room);
  });
  socket.on('signal', (data) => {
    if (!data || typeof data.target !== 'string') return;
    const from = members.get(socket.id);
    const to = members.get(data.target);
    if (!from?.voice || !to?.voice || from.room !== to.room) return;
    if (!['offer', 'answer', 'ice'].includes(data.type) || !data.payload) return;
    io.to(to.id).emit('signal', { sender: socket.id, type: data.type, payload: data.payload });
  });
  socket.on('disconnect', () => leave(socket.id));
});
server.listen(3001, '0.0.0.0', () => console.log(`SubnetMesh: ${tls ? 'https' : 'http'}://localhost:3001`));

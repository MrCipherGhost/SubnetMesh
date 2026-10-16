import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
const a = io('http://localhost:3001');
const b = io('http://localhost:3001');
const wait = (s, event) => new Promise((resolve, reject) => {
 const timer = setTimeout(() => reject(new Error(`Timeout: ${event}`)), 4000);
 s.once(event, data => { clearTimeout(timer); resolve(data); });
});
try {
 await Promise.all([wait(a, 'connect'), wait(b, 'connect')]);
 await a.emitWithAck('room:join', {name:'Alice',room:'general'});
 await b.emitWithAck('room:join', {name:'Bob',room:'general'});
 const message = wait(b, 'chat:message');
 a.emit('chat:send', 'Hello LAN');
 assert.equal((await message).text, 'Hello LAN');
 assert.deepEqual((await a.emitWithAck('voice:join')).peers, []);
 assert.deepEqual((await b.emitWithAck('voice:join')).peers, [a.id]);
 const signal = wait(a, 'signal');
 b.emit('signal', {target:a.id,type:'offer',payload:{type:'offer',sdp:'test'}});
 assert.equal((await signal).sender,b.id);
 const left = wait(a, 'voice:left');
 b.emit('voice:leave');
 assert.equal(await left,b.id);
 console.log('PASS: room join, text delivery, voice membership, signaling, leave');
} finally {a.disconnect(); b.disconnect();}

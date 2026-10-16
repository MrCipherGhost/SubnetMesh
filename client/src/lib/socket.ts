import { io } from 'socket.io-client';
// Same-origin connection works through Vite's proxy and the production server.
export const socket = io({ autoConnect: false });

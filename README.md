# SubnetMesh

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight LAN collaboration web app: React + TypeScript, Express + Socket.IO, browser WebRTC audio mesh, screen sharing, text chat, and password-protected channels. Requires Node.js 22 LTS or newer and npm. Dependencies must be installed before offline use. No external CDN, STUN, TURN, or cloud account is used at runtime.

## Start on one computer

Run these commands in the project root (the folder containing this README):

```bash
npm ci
npm run dev
```

Open http://localhost:5173. Enter a name and select a channel. Repeat in another browser or tab, using a different name. Click Join voice on both clients. Use headphones to avoid feedback. Text chat does not require microphone permission.

## Use multiple computers on the LAN

Microphone access requires a secure browser context. HTTP localhost works on the host computer, but an HTTP LAN IP generally does not. Configure HTTPS before testing voice from other devices.

1. Install mkcert on the host using its official installation instructions: https://github.com/FiloSottile/mkcert
2. Find your host's LAN IP using ipconfig (Windows), ip addr (Linux), or Network settings (macOS). The commands below use 192.168.1.50 as an EXAMPLE; replace it with your host's real address.
3. Run from the project root:

```bash
mkcert -install
mkcert -cert-file certs/local.pem -key-file certs/local-key.pem localhost 127.0.0.1 ::1 192.168.1.50
```

4. On every client device, install and trust the public rootCA.pem certificate from the directory shown by `mkcert -CAROOT`. Follow that device/browser's certificate trust procedure. Never distribute rootCA-key.pem or the server's local-key.pem. A certificate warning bypass alone may not enable microphone access.
5. Restart `npm run dev` and visit https://192.168.1.50:5173 on each device.
6. Allow inbound TCP 5173 on the host's private-network firewall for development. The Vite proxy forwards Socket.IO to the backend; clients do not need direct access to port 3001 in development. WebRTC also requires permitted peer-to-peer traffic, usually UDP. Guest Wi-Fi/client isolation can prevent audio even when chat works.

If the host IP changes, regenerate the certificate with the new address. Keep these certificates outside version control.

## Host the built app

Run in the project root:

```bash
npm run build
npm start
```

Open https://192.168.1.50:3001 when certificates are configured. Allow TCP 3001 on the private-network firewall. One Node process serves both the static frontend and Socket.IO. With no certificates, the server uses HTTP; voice then works only through localhost. Keep the application limited to your trusted LAN; do not forward its port on your router.

## Project structure

```text
SubnetMesh/
  package.json                  Workspace scripts and lint dependencies
  package-lock.json             Reproducible dependency versions
  eslint.config.js              TypeScript and React Hooks rules
  certs/                        Locally generated TLS certificate and key
  client/
    package.json
    tsconfig.json
    vite.config.ts              HTTPS development server and Socket.IO proxy
    index.html
    src/
      main.tsx                  React entry point
      App.tsx                   Channels, chat, members, voice and screen controls
      ScreenStage.tsx           Shared-screen viewer
      Toasts.tsx                In-app notifications
      notify.ts                 Desktop notifications and tab-title flashing
      styles.css                Responsive collaboration interface
      lib/socket.ts             Same-origin Socket.IO client
      webrtc/WebRTCManager.ts   Microphone and RTCPeerConnection lifecycle
  server/
    package.json
    tsconfig.json
    smoke.mjs                   Socket.IO integration smoke check
    src/
      dev.ts                    Development HTTP mode behind Vite
      index.ts                  Static hosting, rooms, text, signaling
      channels.ts               Channel list, creation, password hashing
```

## How voice works

Clicking Join voice gets microphone permission and registers voice membership with the server. Only the newcomer sends offers to existing voice participants. Each browser creates one RTCPeerConnection per remote participant in client/src/webrtc/WebRTCManager.ts. Offers, answers, and ICE candidates pass through Socket.IO; audio travels between browsers. Candidates received before the remote description are buffered. Mute disables the local audio track. Leaving voice, changing rooms, or disconnecting closes peer connections and stops microphone tracks. After a server reconnect, text membership is restored; click Join voice again to restore audio.

If the browser blocks playback, click Enable audio. Failed peer connections require leaving and rejoining voice. Empty iceServers works on many directly reachable LANs; it cannot overcome network isolation or every firewall configuration. Networks requiring relaying need a locally hosted TURN server and matching WebRTC configuration.

## Checks

Run in the project root:

```bash
npm run lint
npm run build
```

With `npm run dev` running in another terminal, run:

```bash
node server/smoke.mjs
```

The smoke check covers channel membership, text delivery, voice membership, signaling relay, and leaving voice. Real microphone capture, playback, and LAN connectivity must be checked using two browsers/devices; these are not covered by the Node smoke check.

## Scope

Three preset channels plus user-created channels with optional passwords (scrypt-hashed, in memory); up to six voice participants per channel; one screen share per channel (a new share replaces the current one); mute/unmute; members list; last 200 messages per channel in memory. Restarting the server clears history. Display names are not authenticated identities. This is a trusted-LAN starter, not a heavy cloud suite replacement: no persistent storage, accounts, file sharing, moderation, or large-room SFU. For larger voice groups, replace the mesh with a locally hosted SFU.

## License

SubnetMesh is released under the [MIT License](LICENSE). Copyright (c) 2026 White Dark Pro.

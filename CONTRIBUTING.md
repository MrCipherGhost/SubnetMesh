# Contributing to SubnetMesh

Thanks for your interest in SubnetMesh! Bug reports, ideas, and pull requests are all welcome.

## Ways to contribute

- **Report a bug** — open an [issue](https://github.com/MrCipherGhost/SubnetMesh/issues/new/choose) using the bug report template.
- **Suggest a feature** — open an issue using the feature request template.
- **Report a security issue** — do **not** open a public issue; follow [SECURITY.md](SECURITY.md).
- **Send a pull request** — see below. Issues labeled `good first issue` are a good place to start.

## Project principles

SubnetMesh works entirely on a local network, so please keep changes in line with that:

- **No cloud dependencies at runtime** — no external CDNs, APIs, STUN/TURN services, or analytics.
- **No accounts or sign-ups.**
- **Keep it lightweight** — think twice before adding a new dependency.

For larger changes, please open an issue first to discuss the idea before writing code.

## Development setup

Requires Node.js 22 or newer.

```bash
git clone https://github.com/MrCipherGhost/SubnetMesh.git
cd SubnetMesh
npm ci
npm run dev
```

Open http://localhost:5173. See the [README](README.md) for testing across devices with HTTPS.

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

## Before you open a pull request

Run these from the project root:

```bash
npm run lint
npm run build
```

Then, with `npm run dev` running in another terminal:

```bash
node server/smoke.mjs
```

For changes to voice or screen sharing, also test manually with at least two browsers, since these can't be covered by automated tests.

CI runs lint, build, and the smoke test on every pull request.

## Pull request guidelines

- Keep each pull request focused on one change.
- Match the style of the surrounding code; `npm run lint` must pass.
- Describe what changed and how you tested it.
- Reference the related issue, e.g. `Fixes #12`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

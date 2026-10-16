# Security Policy

## Supported versions

Security fixes are made for the latest release only. Please update to the newest version before reporting.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report them privately through GitHub instead:

1. Go to the [Security tab](https://github.com/whitedarkpro/SubnetMesh/security) of this repository.
2. Click **Report a vulnerability**.

Please include:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- The affected version or commit

You can expect an initial response within 7 days. Once the issue is confirmed, we will work on a fix, publish a release, and credit you in the security advisory unless you prefer to stay anonymous.

## Security model

SubnetMesh is designed for **trusted local networks**. Please keep the following in mind, both when deploying it and when deciding whether something is a vulnerability:

- **Do not expose SubnetMesh to the internet.** Do not forward its port on your router or put it behind a public reverse proxy.
- **Display names are not authenticated.** Anyone on the network can choose any name. This is a known limitation, not a vulnerability.
- **Channel passwords** are hashed with scrypt and kept in memory only. Restarting the server clears all channels, passwords, and message history.
- **Voice and screen sharing** travel peer-to-peer between browsers over WebRTC (encrypted with DTLS-SRTP). **Text chat and signaling** pass through the local server.
- **HTTPS** requires a locally generated certificate (see the README). Never share or commit your private key or mkcert's `rootCA-key.pem`.

### In scope

- Reading or joining a password-protected channel without the password
- Crashing or hanging the server, or affecting other users, with crafted input
- Code execution, file access, or path traversal on the server
- Cross-site scripting (XSS) through messages, names, or channel names
- Intercepting or hijacking other users' voice or screen-sharing streams

### Out of scope

- Impersonation through display names (see above)
- Issues that require the server to be exposed to the internet
- Attacks that require control of the host machine or of a user's browser
- Denial of service through high traffic volume from the local network

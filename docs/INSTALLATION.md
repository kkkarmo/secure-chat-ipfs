Installation Guide
Prerequisites
Debian/DietPi host with Docker and Compose

Open ports: 3000 (API), 3001 (WebSocket), 4001 TCP/UDP (IPFS P2P), 8080 (IPFS Gateway)

Quick Start
bash
git clone https://github.com/kkkarmo/secure-chat-ipfs.git
cd secure-chat-ipfs
cp .env.example .env
# Edit .env (JWT_SECRET, MONGO_PASSWORD, REDIS_PASSWORD, CORS_ORIGINS)
docker compose up -d
Verify
bash
curl http://<host>:3000/health
curl http://<host>:3000/api/transport/status
curl http://<host>:3000/api/ipfs/status
Ports and Firewall
3000/tcp API

3001/tcp WebSocket

4001/tcp,udp IPFS swarm

8080/tcp IPFS gateway

Optional
SSL/TLS via reverse proxy (Caddy/Nginx/Traefik)

Backups, monitoring


Here is more details:

# Installation Guide

This guide explains how to deploy the Secure Chat Server with IPFS fallback on a fresh Debian/DietPi host, in Docker, and make it reachable locally and from the internet. It also covers environment variables, port forwarding, health checks, and common troubleshooting.

Audience: sysadmins and developers familiar with Linux shells and Docker.

--------------------------------------------------------------------------------

## 1. Overview

The system consists of four services, all run with Docker Compose:

- chat-server: Node.js (Express + Socket.IO) API and demo UI, integrates with IPFS
- ipfs: IPFS Kubo daemon (PubSub enabled, gateway and API exposed)
- mongodb: Persistent document store
- redis: In‑memory cache/session store

Primary transport is HTTPS/WebSocket (HTTP in this guide; you can add TLS later). Fallback transport uses IPFS PubSub and content addressing.

--------------------------------------------------------------------------------

## 2. Requirements

- OS: Debian 12/11, Ubuntu 22.04/20.04, or DietPi based on Debian
- CPU/RAM: 2 vCPU, 2–4GB RAM minimum (more is better)
- Disk: 20GB+ free (IPFS data grows with pinned content)
- Network:
  - Open on host: 3000/tcp, 3001/tcp, 4001/tcp+udp, 8080/tcp
  - Optional public exposure: port forward these from router to host
- Software: Docker Engine and Docker Compose plugin

If using Proxmox, attach the VM to a bridged interface (e.g., vmbr0) so it gets a LAN IP reachable by other devices.

--------------------------------------------------------------------------------

## 3. Install Docker and Compose

On Debian/DietPi:

```bash
# Update packages
sudo apt-get update

# Install dependencies (curl, ca-certificates)
sudo apt-get install -y curl ca-certificates

# Install Docker (official convenience script)
curl -fsSL https://get.docker.com | sh

# Enable and start
sudo systemctl enable docker
sudo systemctl start docker

# Compose plugin usually ships with recent Docker.
# Verify:
docker compose version
```

If docker compose is missing, install the plugin from your distro or follow Docker’s docs for your platform.

--------------------------------------------------------------------------------

## 4. Clone the Repository

```bash
cd /opt
sudo git clone https://github.com/kkkarmo/secure-chat-ipfs.git
cd secure-chat-ipfs
```

If git is missing: `sudo apt-get install -y git`

--------------------------------------------------------------------------------

## 5. Prepare Environment Configuration

Never commit secrets. Create a working .env from the template:

```bash
cp .env.example .env
```

Open `.env` and set these variables:

- Core
  - NODE_ENV=production
  - PORT=3000
  - SOCKET_PORT=3001
- MongoDB
  - MONGODB_URI=mongodb://chatadmin:YOUR_MONGO_PASSWORD@mongodb:27017/secure_chat?authSource=admin
- Redis
  - REDIS_URL=redis://:YOUR_REDIS_PASSWORD@redis:6379
- Security
  - JWT_SECRET=YOUR_RANDOM_64_HEX
    - Generate: `openssl rand -hex 32`
- IPFS
  - IPFS_API_URL=http://ipfs:5001/api/v0
  - IPFS_PUBSUB_ENABLE=true
- CORS (origins allowed by the API)
  - CORS_ORIGINS=http://YOUR_LAN_IP:3000,http://YOUR_PUBLIC_IP:3000,http://localhost:3000

Examples:
- For a LAN-only server at 192.168.4.39:
  - CORS_ORIGINS=http://192.168.4.39:3000,http://localhost:3000
- If also accessed via public IP 199.192.89.7:
  - CORS_ORIGINS=http://192.168.4.39:3000,http://199.192.89.7:3000,http://localhost:3000

Tip: Keep origins exact (no brackets or markdown), comma-separated, no spaces.

--------------------------------------------------------------------------------

## 6. Review docker-compose.yml

Key ports exposed:

- chat-server: 3000 (API), 3001 (WebSocket)
- ipfs: 4001/tcp and 4001/udp (swarm), 5001 (IPFS API), 8080 (gateway)
- mongodb: 27017 (local DB access)
- redis: 6379 (local cache)

Volumes ensure data persists across restarts.

--------------------------------------------------------------------------------

## 7. Start the Stack

Start everything:

```bash
docker compose up -d
```

Check status:

```bash
docker compose ps
```

You should see all services “Up” (IPFS becomes “healthy” after a short while).

Follow logs:

```bash
docker compose logs -f
```

Tail a single service (e.g., chat-server):

```bash
docker compose logs -f chat-server
```

--------------------------------------------------------------------------------

## 8. Verify Locally

From the server (or another machine on the same LAN):

```bash
curl http://:3000/health
curl http://:3000/api/transport/status
curl http://:3000/api/ipfs/status
```

If all return JSON with “healthy”, the system is running.

Open the demo UI:

- http://:3000/demo

If the top banner shows “Server connection failed,” open the browser DevTools → Network:
- Ensure GET /health, /api/transport/status, /api/ipfs/status return 200
- If they fail without HTTP status, it’s a network reachability/firewall issue
- If CORS errors appear, correct CORS_ORIGINS in .env and restart chat-server

--------------------------------------------------------------------------------

## 9. Port Forwarding (Public Access)

On your router, forward these to your server’s LAN IP:

- 3000/tcp (API + demo UI)
- 3001/tcp (WebSocket)
- 4001/tcp and 4001/udp (IPFS P2P)
- 8080/tcp (IPFS gateway, optional but useful for easy content access)

Public access URLs:
- App: http://PUBLIC_IP:3000/demo
- Health: http://PUBLIC_IP:3000/health
- IPFS Gateway: http://PUBLIC_IP:8080

Security note: For production, use a domain and TLS (see SSL/TLS section).

--------------------------------------------------------------------------------

## 10. SSL/TLS (Production)

Use a reverse proxy like Caddy, Traefik, or Nginx to terminate TLS:

High-level steps (Caddy example):
1) Point your domain DNS (A record) to your public IP
2) Run Caddy on the same host or upstream
3) Proxy routes:
   - https://chat.yourdomain.com → http://localhost:3000
   - WebSocket pass-through for :3001
   - Optionally expose IPFS gateway at a subdomain

CORS update: if moving to HTTPS/domain, add the new origin(s) to CORS_ORIGINS and restart chat-server.

--------------------------------------------------------------------------------

## 11. Using the System

- Demo UI: http://HOST:3000/demo
  - Send via Primary (HTTPS): normal API + WebSocket path
  - Send via IPFS: directly leverages IPFS PubSub/content
  - Send via Both: dual transport

- REST examples:

Send a message:

```bash
curl -X POST http://HOST:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{"recipient_id":"demo","encrypted_content":"SGVsbG8gV29ybGQh","transport_mode":"dual"}'
```

Add content to IPFS:

```bash
curl -X POST http://HOST:3000/api/ipfs/add \
  -H "Content-Type: application/json" \
  -d '{"payload_b64":"U2VjdXJlIENoYXQgSVBGUyB0ZXN0","filename":"hello.txt"}'
```

Open IPFS content:
- Local gateway: http://HOST:8080/ipfs/CID
- Public gateways: https://ipfs.io/ipfs/CID, https://cloudflare-ipfs.com/ipfs/CID

--------------------------------------------------------------------------------

## 12. Service Management

Start/stop:

```bash
docker compose up -d
docker compose down
```

Restart one service:

```bash
docker compose restart chat-server
```

View logs:

```bash
docker compose logs -f chat-server
```

--------------------------------------------------------------------------------

## 13. Backups and Data

Volumes (do not delete casually):
- mongodb-data: MongoDB database
- redis-data: Redis AOF data (if enabled)
- ipfs-data: IPFS repository (CIDs, pins, keys)
- chat-logs: application logs (if used)

Basic backup (cold):
1) Stop stack: `docker compose down`
2) Archive volumes directories (as configured in docker-compose or default Docker volumes path)
3) Start stack: `docker compose up -d`

For hot backups, use MongoDB dump tools and IPFS pin sets depending on your retention policy.

--------------------------------------------------------------------------------

## 14. Proxmox Notes

If hosting in Proxmox:

- Network: set VM NIC to a bridged interface (e.g., vmbr0) attached to your physical NIC. This gives the VM a first-class LAN IP (e.g., 192.168.4.39).
- Avoid NAT-only or isolated networks unless you add proper forwarding rules; otherwise, peers on the LAN (your laptop/phone) won’t reach ports 3000/3001/8080.
- If Proxmox firewall is enabled at Datacenter/Node/VM levels, add ACCEPT rules for 3000/tcp, 3001/tcp, 4001/tcp+udp, 8080/tcp to the VM IP, or disable firewall for testing.

--------------------------------------------------------------------------------

## 15. Security Checklist

- Do not expose IPFS API (5001) publicly; only gateway (8080) should be accessible
- Set strong JWT_SECRET, Mongo and Redis passwords
- Limit CORS_ORIGINS to exact origins you use (LAN IP, domain)
- Use TLS for public access (reverse proxy)
- Keep Docker and OS updated
- Consider a WAF/reverse proxy with rate limiting for internet exposure

--------------------------------------------------------------------------------

## 16. Troubleshooting

A) Demo shows “Server connection failed”
- Open browser DevTools → Network
- Ensure /health, /api/transport/status, /api/ipfs/status return 200
- If requests are (failed) with 0B transferred:
  - Network reachability issue (firewall/VLAN/guest isolation). From the client:
    - `ping HOST_IP`
    - `curl -i http://HOST_IP:3000/health`
- If CORS error:
  - Fix CORS_ORIGINS in .env to include the exact origin (e.g., http://192.168.4.39:3000 or http://yourdomain:3000)
  - Restart chat-server

B) WebSocket doesn’t connect
- Verify port 3001 open/forwarded
- DevTools → Network → WS shows status 101 on ws://HOST:3001/socket.io/…
- Ensure CSP connectSrc isn’t blocking; if using Helmet CSP, include:
  - http://HOST:*, ws://HOST:*
  - Add public IP/domain patterns if you serve via those origins

C) IPFS unavailable
- Check IPFS container health: `docker compose ps`
- PubSub test:
  - `docker compose exec ipfs ipfs pubsub ls`
- Check peers: `docker compose exec ipfs ipfs swarm peers | wc -l`

D) Compose says “version attribute is obsolete”
- Informational for v2 compose; safe to ignore or remove “version:” from compose file.

E) GitHub push issues (repo management)
- Use HTTPS + PAT (token) for pushes or configure SSH keys
- Ensure `.env` is ignored by `.gitignore`

--------------------------------------------------------------------------------

## 17. Moving to HTTPS

Add a reverse proxy (Caddy/Nginx/Traefik):

- Terminate TLS
- Proxy / and WebSocket to the app
- Add HSTS and security headers at proxy (or app-level with Helmet)
- Update CORS_ORIGINS to include the HTTPS origin(s)

Example origin change:
- CORS_ORIGINS=https://chat.yourdomain.com

--------------------------------------------------------------------------------

## 18. Upgrades

Pull latest repo changes and re-deploy:

```bash
git pull
docker compose pull
docker compose up -d --build
```

If dependencies in package.json changed, the chat-server image will rebuild automatically.

--------------------------------------------------------------------------------

## 19. Uninstall / Clean Up

```bash
# Stop and remove containers
docker compose down

# Remove named volumes (DATA LOSS!)
docker volume rm    # or `docker compose down -v`

# Optionally remove images
docker image prune -a
```

Double-check volume names via `docker volume ls` before removing.

--------------------------------------------------------------------------------

## 20. Quick Commands Reference

- Start all: `docker compose up -d`
- Stop all: `docker compose down`
- Status: `docker compose ps`
- Logs: `docker compose logs -f`
- Restart chat-server: `docker compose restart chat-server`
- Health:
  - `curl http://HOST:3000/health`
  - `curl http://HOST:3000/api/transport/status`
  - `curl http://HOST:3000/api/ipfs/status`
- IPFS peers: `docker compose exec ipfs ipfs swarm peers | wc -l`
- Add IPFS file via API:
  - `curl -X POST http://HOST:3000/api/ipfs/add -H "Content-Type: application/json" -d '{"payload_b64":"..."}'`

--------------------------------------------------------------------------------

You’re ready to deploy locally or publicly. Start with LAN tests, then add router forwarding and TLS when exposing to the internet. If anything blocks the demo status tiles, check DevTools → Network for /health and /api/*; align CORS, CSP, and networking until those three return 200.

[1] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/images/15109275/4875f921-f408-4de3-b5e9-0d9304d5abff/image.jpeg


Technical Guide
Architecture
chat-server (Express + Socket.IO)

IPFS Kubo (PubSub, add/cat, gateway)

MongoDB (storage), Redis (sessions/cache)

Docker Compose orchestrates all services

Code Layout
src/server.js: HTTP routes, demo UI, status endpoints, WS handlers

src/services/ipfs-service.js: IPFS API wrapper (add/cat/pubsub)

Configuration (.env)
PORT, SOCKET_PORT

MONGODB_URI, REDIS_URL

JWT_SECRET

IPFS_API_URL, IPFS_PUBSUB_ENABLE

CORS_ORIGINS: comma-separated origins (e.g., http://LAN:3000,http://PUBLIC:3000)

Networking
3000 API, 3001 WS

4001 TCP/UDP swarm, 5001 API (internal), 8080 gateway

Proxmox: use bridged NIC (vmbr0) for a first-class LAN IP

Security
Helmet, rate limiting

CORS — allow only explicit origins

Keep secrets out of git (.env in .gitignore)

Troubleshooting
Browser DevTools: check /health and /api/* fetches

docker compose logs -f chat-server

IPFS checks: swarm peers, repo stat

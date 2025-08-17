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

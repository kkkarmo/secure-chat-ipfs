
Secure Chat Server with IPFS Fallback
Dual-transport secure messaging: HTTPS/WebSocket primary with IPFS fallback (PubSub + content addressing).

Quick Start
bash
git clone https://github.com/kkkarmo/secure-chat-ipfs.git
cd secure-chat-ipfs
cp .env.example .env
docker compose up -d
Docs
Installation: docs/INSTALLATION.md

User Guide: docs/USER_GUIDE.md

Technical Guide: docs/TECHNICAL_GUIDE.md

Ports
3000 (API), 3001 (WebSocket)

4001 TCP/UDP (IPFS swarm), 8080 (IPFS gateway)
# secure-chat-ipfs

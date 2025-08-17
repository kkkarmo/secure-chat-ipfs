
User Guide
Overview
Secure chat with dual-transport: primary HTTPS/WebSocket and IPFS fallback.

Demo
Open:

http://<host>:3000/demo

Use buttons to:

Send via Primary (HTTPS/WebSocket)

Send via IPFS

Send via Both Transports

Reading Status Tiles
Transport Status: shows HTTP/WebSocket availability

IPFS Status: node ID, peer count, and PubSub enabled

IPFS Content
Local: http://<host>:8080/ipfs/<CID>

Public gateways: https://ipfs.io/ipfs/<CID>, https://cloudflare-ipfs.com/ipfs/<CID>

Tips
Use same origin as server (avoid https/http mismatches)

For public access, use a domain + TLS

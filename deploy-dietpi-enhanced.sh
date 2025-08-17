#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🚀 Starting Secure Chat Infrastructure (IPFS + MongoDB + Redis)..."

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    print_error "Please run as root: sudo $0"
    exit 1
fi

print_status "DietPi detected. Setting up infrastructure..."

# Ensure Docker is running
systemctl enable docker
systemctl start docker
usermod -aG docker dietpi

# Configure firewall
print_status "Configuring firewall..."
iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
iptables -I INPUT -p tcp --dport 4001 -j ACCEPT
iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
iptables -I INPUT -p udp --dport 4001 -j ACCEPT

# Generate secure secrets
print_status "Generating secure secrets..."
JWT_SECRET=$(openssl rand -hex 32)
MONGO_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

# Create .env file
cat > .env << ENVEOF
NODE_ENV=production
PORT=3000
SOCKET_PORT=3001
MONGODB_URI=mongodb://chatadmin:$MONGO_PASSWORD@mongodb:27017/secure_chat?authSource=admin
MONGO_USER=chatadmin
MONGO_PASSWORD=$MONGO_PASSWORD
REDIS_URL=redis://:$REDIS_PASSWORD@redis:6379
REDIS_PASSWORD=$REDIS_PASSWORD
JWT_SECRET=$JWT_SECRET
IPFS_API_URL=http://ipfs:5001/api/v0
IPFS_PUBSUB_ENABLE=true
CORS_ORIGINS=http://localhost:3000,https://localhost:3000
ENVEOF

print_status "Environment file created with secure secrets"

# Create infrastructure-only docker-compose.yml
print_status "Creating infrastructure configuration..."
cat > docker-compose.yml << 'COMPOSEEOF'
version: '3.8'

services:
  # IPFS Node for Fallback Transport
  ipfs:
    image: ipfs/kubo:v0.22.0
    container_name: chat-ipfs
    restart: unless-stopped
    environment:
      - IPFS_PROFILE=server
      - IPFS_LOGGING=info
    ports:
      - "4001:4001"    # IPFS Swarm
      - "4001:4001/udp" 
      - "5001:5001"    # IPFS API
      - "8080:8080"    # IPFS Gateway
    volumes:
      - ipfs-data:/data/ipfs
    networks:
      - chat-network
    command: [
      "daemon",
      "--migrate=true", 
      "--enable-pubsub-experiment"
    ]
    healthcheck:
      test: ["CMD", "ipfs", "id"]
      interval: 30s
      timeout: 10s
      retries: 5

  # MongoDB Database
  mongodb:
    image: mongo:6.0-focal
    container_name: chat-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_USER:-chatadmin}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}
      - MONGO_INITDB_DATABASE=secure_chat
    networks:
      - chat-network
    volumes:
      - mongodb-data:/data/db
    command: ["mongod", "--auth", "--bind_ip_all"]

  # Redis for Session Management
  redis:
    image: redis:7-alpine
    container_name: chat-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    networks:
      - chat-network
    volumes:
      - redis-data:/data
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"]

networks:
  chat-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

volumes:
  mongodb-data:
    driver: local
  redis-data:
    driver: local
  ipfs-data:
    driver: local
COMPOSEEOF

# Start infrastructure services
print_status "Starting infrastructure services..."
docker compose up -d

# Wait for services
print_status "Waiting for services to initialize..."
sleep 45

# Check service status
print_status "Checking service status..."
docker compose ps

# Test services
print_status "Testing services..."
IPFS_READY=false
MONGO_READY=false
REDIS_READY=false

# Check IPFS
for i in {1..5}; do
    if docker compose exec -T ipfs ipfs id >/dev/null 2>&1; then
        IPFS_READY=true
        print_status "IPFS node is ready"
        break
    fi
    print_status "Waiting for IPFS... (attempt $i/5)"
    sleep 10
done

# Check MongoDB
for i in {1..3}; do
    if docker compose exec -T mongodb mongosh --eval "db.runCommand('ping')" >/dev/null 2>&1; then
        MONGO_READY=true
        print_status "MongoDB is ready"
        break
    fi
    print_status "Waiting for MongoDB... (attempt $i/3)"
    sleep 5
done

# Check Redis
for i in {1..3}; do
    if docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
        REDIS_READY=true
        print_status "Redis is ready"
        break
    fi
    print_status "Waiting for Redis... (attempt $i/3)"
    sleep 5
done

# Get IP address
IP_ADDRESS=$(hostname -I | awk '{print $1}')

# Final status
echo ""
echo "🎯 Infrastructure Deployment Summary:"
echo "====================================="

if [ "$IPFS_READY" = true ]; then
    echo "✅ IPFS: Running and ready"
    IPFS_ID=$(docker compose exec -T ipfs ipfs id --format="<id>" 2>/dev/null || echo "N/A")
    echo "   Node ID: $IPFS_ID"
else
    echo "⚠️  IPFS: May still be starting"
fi

if [ "$MONGO_READY" = true ]; then
    echo "✅ MongoDB: Running and ready"
else
    echo "⚠️  MongoDB: May still be starting"
fi

if [ "$REDIS_READY" = true ]; then
    echo "✅ Redis: Running and ready"
else
    echo "⚠️  Redis: May still be starting"
fi

echo ""
echo "🌐 Access Points:"
echo "  IPFS Gateway: http://$IP_ADDRESS:8080"
echo "  IPFS WebUI: http://$IP_ADDRESS:5001/webui"
echo "  IPFS API: http://$IP_ADDRESS:5001"
echo "  MongoDB: $IP_ADDRESS:27017"
echo "  Redis: $IP_ADDRESS:6379"
echo ""

echo "🔐 Generated Credentials:"
echo "  MongoDB User: chatadmin"
echo "  MongoDB Password: $MONGO_PASSWORD"
echo "  Redis Password: $REDIS_PASSWORD"
echo "  JWT Secret: $JWT_SECRET"
echo "  (All saved in .env file)"
echo ""

echo "🔧 Test Commands:"
echo "  IPFS version: curl http://$IP_ADDRESS:8080/version"
echo "  IPFS node info: docker compose exec ipfs ipfs id"
echo "  IPFS peers: docker compose exec ipfs ipfs swarm peers"
echo "  MongoDB: docker compose exec mongodb mongosh -u chatadmin -p"
echo "  Redis: docker compose exec redis redis-cli -a $REDIS_PASSWORD"
echo ""

echo "📊 Service Management:"
echo "  View logs: docker compose logs -f"
echo "  Stop all: docker compose down"
echo "  Restart: docker compose restart"
echo "  Status: docker compose ps"
echo ""

# Test IPFS gateway
if curl -s --connect-timeout 5 "http://localhost:8080/version" >/dev/null; then
    echo "✅ IPFS Gateway test: SUCCESS"
else
    echo "⚠️  IPFS Gateway test: May still be starting"
fi

echo ""
if [ "$IPFS_READY" = true ] && [ "$MONGO_READY" = true ] && [ "$REDIS_READY" = true ]; then
    echo "🎉 Infrastructure deployment completed successfully!"
    echo ""
    echo "🚀 Ready for next steps:"
    echo "1. Test IPFS: open http://$IP_ADDRESS:8080 in your browser"
    echo "2. Test IPFS WebUI: open http://$IP_ADDRESS:5001/webui"
    echo "3. Test PubSub: docker compose exec ipfs ipfs pubsub sub test-topic"
    echo "4. Add chat server source code when ready"
else
    echo "⚠️  Some services may still be starting. Check with:"
    echo "   docker compose logs -f"
fi

echo ""
echo "🔗 Your DietPi Infrastructure IP: $IP_ADDRESS"
echo "✅ IPFS + MongoDB + Redis infrastructure is ready!"

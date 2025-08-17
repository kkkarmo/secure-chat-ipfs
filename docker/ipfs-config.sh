#!/bin/bash
set -e

echo "🔧 Configuring IPFS node for chat server..."

while ! ipfs id >/dev/null 2>&1; do
    echo "⏳ Waiting for IPFS to start..."
    sleep 2
done

# Enable PubSub
ipfs config --json Pubsub.Router "gossipsub"
ipfs config --json Pubsub.DisableSigning false

# Configure API CORS
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'

# Set addresses
ipfs config --json Addresses.Swarm '["/ip4/0.0.0.0/tcp/4001", "/ip4/0.0.0.0/udp/4001/quic"]'
ipfs config Addresses.API "/ip4/0.0.0.0/tcp/5001"
ipfs config Addresses.Gateway "/ip4/0.0.0.0/tcp/8080"

echo "✅ IPFS configuration completed!"

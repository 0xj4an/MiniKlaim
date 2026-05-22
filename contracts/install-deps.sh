#!/usr/bin/env bash
# Install Foundry deps for the contracts/ project.
# Run from the contracts/ directory: bash install-deps.sh
set -euo pipefail

cd "$(dirname "$0")"

mkdir -p lib

if [ ! -d lib/forge-std ]; then
  git clone --depth=1 --branch v1.10.0 https://github.com/foundry-rs/forge-std lib/forge-std
fi

if [ ! -d lib/openzeppelin-contracts ]; then
  git clone --depth=1 --branch v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
fi

echo "Deps installed. Run: forge test"

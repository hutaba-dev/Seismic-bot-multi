# Seismic Auto Bot - Airdrop Insiders 
# Forked by hutaba for multi wallets

A Node.js tool for deploying ERC-20 compatible tokens on the Seismic devnet and automating token transfers to random addresses for testing and airdrop simulations.

## Features

- One-click token deployment on Seismic devnet
- Automated token transfers to multiple addresses
- Real-time transaction status updates
- Simple interactive prompt-based interface

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A wallet with ETH on Seismic devnet

## Installation

```bash
# Clone the repository
git clone https://github.com/airdropinsiders/Seismic-Auto-Bot.git

# Navigate to the project directory
cd Seismic-Auto-Bot

# Install dependencies
npm install ethers solc dotenv readline crypto axios
```

## Configuration

Create a `wallets.txt` file in the root directory with your private key per a line:

```
your_private_key_here_1
your_private_key_here_2
```
Create a `proxies.txt` file in the root directory with your private key per a line:
```
http://user1:pass1@proxy1.com:8080
http://proxy2.com:8080
```

> ⚠️ **SECURITY WARNING**: Never share your private key or commit the wallets.txt file to GitHub.

## Usage

Run the tool with:

```bash
node index.js
```

The interactive CLI will guide you through:

1. Token creation (name, symbol, total supply)
2. Token deployment to Seismic devnet
3. Optional: Automated token transfers to random addresses

## Token Contract

The script deploys a standard ERC-20 compatible token contract with the following features:

- Token name, symbol, and decimals
- Balance tracking for addresses
- Transfer and approval functionality
- Standard ERC-20 events

## Network Information

The tool connects to:
- Network: Seismic devnet
- Chain ID: 5124
- RPC URL: https://node-2.seismicdev.net/rpc
- Explorer: https://explorer-2.seismicdev.net/

## Contributors

- Airdrop Insiders Team
- Forked by Hutaba

## License

MIT License

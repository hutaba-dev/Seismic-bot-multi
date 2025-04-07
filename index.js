const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const solc = require("solc");
const crypto = require("crypto");
const axios = require("axios");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const tokenContractSource = `
pragma solidity ^0.8.13;

contract SeismicToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _totalSupply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply * 10**uint256(decimals);
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 value) public returns (bool success) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool success) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool success) {
        require(value <= balanceOf[from], "Insufficient balance");
        require(value <= allowance[from][msg.sender], "Insufficient allowance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        allowance[from][msg.sender] -= value;
        emit Transfer(from, to, value);
        return true;
    }
}
`;

function saveContractToFile(contractSource, filename) {
  const filePath = path.join(__dirname, filename);
  fs.writeFileSync(filePath, contractSource);
  return filePath;
}

function compileContract(contractPath, contractName) {
  const contractSource = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      [path.basename(contractPath)]: {
        content: contractSource,
      },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((error) => error.severity === "error");
    if (errors.length > 0) {
      throw new Error(`Compilation errors: ${JSON.stringify(errors, null, 2)}`);
    }
  }

  const contractFileName = path.basename(contractPath);
  const compiledContract = output.contracts[contractFileName][contractName];

  if (!compiledContract) {
    throw new Error(`Contract ${contractName} not found in compilation output`);
  }

  return {
    abi: compiledContract.abi,
    bytecode: compiledContract.evm.bytecode.object,
  };
}

function generateRandomAddress() {
  const privateKey = "0x" + crypto.randomBytes(32).toString("hex");
  const wallet = new ethers.Wallet(privateKey);
  return { address: wallet.address, privateKey };
}

function displaySection(title) {
  console.log(
    "\n" +
      colors.cyan +
      colors.bright +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" +
      colors.reset
  );
  console.log(colors.cyan + " 🚀 " + title + colors.reset);
  console.log(
    colors.cyan +
      colors.bright +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" +
      colors.reset
  );
}

// wallets.txt에서 개인 키 로드
function loadWallets() {
  try {
    const walletsData = fs.readFileSync("wallets.txt", "utf8");
    const privateKeys = walletsData
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line.match(/^(0x)?[0-9a-fA-F]{64}$/))
      .map((key) => (key.startsWith("0x") ? key : `0x${key}`));
    if (privateKeys.length === 0) {
      throw new Error("No valid private keys found in wallets.txt");
    }
    return privateKeys;
  } catch (error) {
    throw new Error(`Failed to load wallets: ${error.message}`);
  }
}

// proxies.txt에서 프록시 로드
function loadProxies() {
  try {
    if (!fs.existsSync("proxies.txt")) {
      console.log(
        `${colors.yellow}⚠ No proxies.txt found. Proceeding without proxies.${colors.reset}`
      );
      return [];
    }
    const proxiesData = fs.readFileSync("proxies.txt", "utf8");
    const proxies = proxiesData
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line.startsWith("http"));
    return proxies;
  } catch (error) {
    throw new Error(`Failed to load proxies: ${error.message}`);
  }
}

// 프록시를 통한 JsonRpcProvider 생성
function createProviderWithProxy(rpcUrl, proxyUrl = null) {
  if (!proxyUrl) {
    return new ethers.providers.JsonRpcProvider(rpcUrl);
  }

  const customFetch = async (request, options) => {
    try {
      const response = await axios({
        method: request.method,
        url: request.url,
        data: request.body,
        headers: request.headers,
        proxy: {
          protocol: proxyUrl.startsWith("https") ? "https" : "http",
          host: new URL(proxyUrl).hostname,
          port: parseInt(new URL(proxyUrl).port),
          auth:
            new URL(proxyUrl).username && new URL(proxyUrl).password
              ? {
                  username: new URL(proxyUrl).username,
                  password: new URL(proxyUrl).password,
                }
              : undefined,
        },
      });
      return {
        statusCode: response.status,
        body: JSON.stringify(response.data),
      };
    } catch (error) {
      throw new Error(`Proxy request failed: ${error.message}`);
    }
  };

  return new ethers.providers.JsonRpcProvider(
    { url: rpcUrl, fetch: customFetch },
    5124
  );
}

// 월렛과 프록시 초기화
async function initializeWallets(rpcUrl) {
  const privateKeys = loadWallets();
  const proxies = loadProxies();
  const wallets = [];

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const proxyUrl = proxies[i % proxies.length] || null; // 프록시 순환 사용
    const provider = createProviderWithProxy(rpcUrl, proxyUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await wallet.getBalance();
    wallets.push({
      wallet,
      address: wallet.address,
      balance: ethers.utils.formatEther(balance),
      proxy: proxyUrl || "None",
    });
  }

  return wallets;
}

async function deployTokenContract(tokenName, tokenSymbol, totalSupply, wallets) {
  try {
    displaySection("DEPLOYING TOKEN CONTRACT");
    console.log(`📝 Token Name: ${colors.yellow}${tokenName}${colors.reset}`);
    console.log(`🔤 Token Symbol: ${colors.yellow}${tokenSymbol}${colors.reset}`);
    console.log(`💰 Total Supply: ${colors.yellow}${totalSupply}${colors.reset}`);
    console.log(
      `🌐 Network: ${colors.yellow}Seismic devnet (Chain ID: 5124)${colors.reset}`
    );

    // 첫 번째 월렛으로 배포
    const deployer = wallets[0];
    console.log(
      `👛 Deployer: ${colors.yellow}${deployer.address}${colors.reset}`
    );
    console.log(
      `💎 Wallet Balance: ${colors.yellow}${deployer.balance} ETH${colors.reset}`
    );
    console.log(
      `🌐 Proxy: ${colors.yellow}${deployer.proxy}${colors.reset}`
    );

    if (parseFloat(deployer.balance) === 0) {
      throw new Error("Deployer wallet has no ETH for transaction fees.");
    }

    const contractPath = saveContractToFile(
      tokenContractSource,
      "SeismicToken.sol"
    );
    console.log(
      `📄 Contract saved to: ${colors.yellow}${contractPath}${colors.reset}`
    );

    const { abi, bytecode } = compileContract(contractPath, "SeismicToken");
    console.log(`${colors.green}✅ Contract compiled successfully${colors.reset}`);

    const factory = new ethers.ContractFactory(
      abi,
      "0x" + bytecode,
      deployer.wallet
    );

    console.log(`⏳ Initiating deployment...`);
    const contract = await factory.deploy(tokenName, tokenSymbol, totalSupply, {
      gasLimit: 3000000,
    });

    console.log(
      `🔄 Transaction hash: ${colors.yellow}${contract.deployTransaction.hash}${colors.reset}`
    );
    console.log(`⏳ Waiting for confirmation...`);

    await contract.deployTransaction.wait();

    console.log(
      `\n${colors.green}✅ Token Contract deployed successfully!${colors.reset}`
    );
    console.log(
      `📍 Contract address: ${colors.yellow}${contract.address}${colors.reset}`
    );
    console.log(
      `🔍 View on explorer: ${colors.yellow}https://explorer-2.seismicdev.net/address/${contract.address}${colors.reset}`
    );

    return { contractAddress: contract.address, abi };
  } catch (error) {
    console.error(
      `${colors.red}❌ Error deploying contract: ${error.message}${colors.reset}`
    );
    throw error;
  }
}

async function transferTokens(contractAddress, abi, numTransfers, amountPerTransfer, wallets) {
  try {
    displaySection("TRANSFERRING TOKENS");
    console.log(
      `📊 Number of transfers: ${colors.yellow}${numTransfers}${colors.reset}`
    );
    console.log(
      `💸 Amount per transfer: ${colors.yellow}${amountPerTransfer}${colors.reset}`
    );
    console.log(
      `🎯 Contract address: ${colors.yellow}${contractAddress}${colors.reset}`
    );

    console.log(
      `\n${colors.cyan}📤 Starting transfers...${colors.reset}`
    );

    console.log(
      "\n" +
        colors.cyan +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" +
        colors.reset
    );
    console.log(
      `${colors.bright}  #  | Sender Address                              | Recipient Address                            | Amount         | Status${colors.reset}`
    );
    console.log(
      colors.cyan +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" +
        colors.reset
    );

    for (let i = 0; i < numTransfers; i++) {
      // 랜덤 월렛 선택
      const walletInfo = wallets[i % wallets.length];
      const tokenContract = new ethers.Contract(
        contractAddress,
        abi,
        walletInfo.wallet
      );
      const recipient = generateRandomAddress();
      const formattedAmount = ethers.utils.parseUnits(
        amountPerTransfer.toString(),
        18
      );

      try {
        // 잔액 체크
        const balance = await tokenContract.balanceOf(walletInfo.address);
        if (balance.lt(formattedAmount)) {
          throw new Error(`Insufficient token balance in ${walletInfo.address}`);
        }

        const tx = await tokenContract.transfer(recipient.address, formattedAmount);

        process.stdout.write(
          `  ${i + 1}`.padEnd(4) +
            "| " +
            `${walletInfo.address}`.padEnd(45) +
            "| " +
            `${recipient.address}`.padEnd(45) +
            "| " +
            `${amountPerTransfer}`.padEnd(15) +
            "| " +
            `${colors.yellow}Pending...${colors.reset}`
        );

        await tx.wait();

        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        console.log(
          `  ${i + 1}`.padEnd(4) +
            "| " +
            `${walletInfo.address}`.padEnd(45) +
            "| " +
            `${recipient.address}`.padEnd(45) +
            "| " +
            `${amountPerTransfer}`.padEnd(15) +
            "| " +
            `${colors.green}✅ Success${colors.reset}`
        );
      } catch (error) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        console.log(
          `  ${i + 1}`.padEnd(4) +
            "| " +
            `${walletInfo.address}`.padEnd(45) +
            "| " +
            `${recipient.address}`.padEnd(45) +
            "| " +
            `${amountPerTransfer}`.padEnd(15) +
            "| " +
            `${colors.red}❌ Failed: ${error.message}${colors.reset}`
        );
      }
    }

    console.log(
      colors.cyan +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" +
        colors.reset
    );
    console.log(
      `\n${colors.green}✅ Transfer operations completed${colors.reset}`
    );
  } catch (error) {
    console.error(
      `${colors.red}❌ Error transferring tokens: ${error.message}${colors.reset}`
    );
    throw error;
  }
}

async function main() {
  console.log(
    "\n" +
      colors.cyan +
      colors.bright +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" +
      colors.reset
  );
  console.log(
    colors.cyan +
      colors.bright +
      "       SEISMIC TOKEN AUTO BOT - AIRDROP INSIDERS           " +
      colors.reset
  );
  console.log(
    colors.cyan +
      colors.bright +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" +
      colors.reset
  );
  console.log(
    `${colors.yellow}🌐 Network: Seismic devnet (Chain ID: 5124)${colors.reset}`
  );

  const rpcUrl = "https://node-2.seismicdev.net/rpc";

  try {
    // 월렛과 프록시 초기화
    const wallets = await initializeWallets(rpcUrl);
    console.log(
      `\n${colors.green}✅ Loaded ${wallets.length} wallets:${colors.reset}`
    );
    wallets.forEach((w, index) => {
      console.log(
        `  Wallet ${index + 1}: ${colors.yellow}${w.address}${colors.reset}, Balance: ${colors.yellow}${w.balance} ETH${colors.reset}, Proxy: ${colors.yellow}${w.proxy}${colors.reset}`
      );
    });

    rl.question(
      `\n${colors.yellow}📝 Enter token name: ${colors.reset}`,
      (name) => {
        rl.question(
          `${colors.yellow}🔤 Enter token symbol: ${colors.reset}`,
          (symbol) => {
            rl.question(
              `${colors.yellow}💰 Enter total supply: ${colors.reset}`,
              async (supply) => {
                if (!name || !symbol || !supply) {
                  console.error(
                    `${colors.red}❌ All fields are required!${colors.reset}`
                  );
                  rl.close();
                  return;
                }

                try {
                  const totalSupply = parseInt(supply);
                  if (isNaN(totalSupply) || totalSupply <= 0) {
                    throw new Error("Total supply must be a positive number");
                  }

                  const { contractAddress, abi } = await deployTokenContract(
                    name,
                    symbol,
                    totalSupply,
                    wallets
                  );

                  rl.question(
                    `\n${colors.yellow}🔄 Do you want to transfer tokens to random addresses? (y/n): ${colors.reset}`,
                    (transferChoice) => {
                      if (transferChoice.toLowerCase() === "y") {
                        rl.question(
                          `${colors.yellow}📊 Enter number of transfers to perform: ${colors.reset}`,
                          (numTransfers) => {
                            rl.question(
                              `${colors.yellow}💸 Enter amount per transfer: ${colors.reset}`,
                              async (amountPerTransfer) => {
                                try {
                                  const transfers = parseInt(numTransfers);
                                  const amount = parseFloat(amountPerTransfer);

                                  if (isNaN(transfers) || transfers <= 0) {
                                    throw new Error(
                                      "Number of transfers must be a positive number"
                                    );
                                  }

                                  if (isNaN(amount) || amount <= 0) {
                                    throw new Error(
                                      "Amount must be a positive number"
                                    );
                                  }

                                  await transferTokens(
                                    contractAddress,
                                    abi,
                                    transfers,
                                    amount,
                                    wallets
                                  );

                                  console.log(
                                    `\n${colors.green}🎉 All operations completed successfully!${colors.reset}`
                                  );
                                } catch (error) {
                                  console.error(
                                    `${colors.red}❌ Error: ${error.message}${colors.reset}`
                                  );
                                } finally {
                                  rl.close();
                                }
                              }
                            );
                          }
                        );
                      } else {
                        console.log(
                          `\n${colors.green}🎉 Token deployment completed successfully!${colors.reset}`
                        );
                        rl.close();
                      }
                    }
                  );
                } catch (error) {
                  console.error(
                    `${colors.red}❌ Error: ${error.message}${colors.reset}`
                  );
                  rl.close();
                }
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error(
      `${colors.red}❌ An error occurred: ${error.message}${colors.reset}`
    );
    rl.close();
  }
}

main();

import express from 'express';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import psTree from 'ps-tree';
import { promisify } from 'util';
import { mkdir, writeFile, readFile, rm, cp } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const psList = promisify(psTree);

class DAppFactory {
  constructor() {
    this.apps = new Map();
    this.appsDir = './dapps';
    this.init();
  }

  async init() {
    try {
      await mkdir(this.appsDir, { recursive: true });
      console.log('🏭 Blockchain dApp Factory initialized');
    } catch (err) {
      console.error('Failed to initialize dApp Factory:', err);
    }
  }

  async setupHardhatProject(workDir, name) {
    try {
      // Create basic project structure
      await mkdir(join(workDir, 'contracts'), { recursive: true });
      await mkdir(join(workDir, 'scripts'), { recursive: true });
      await mkdir(join(workDir, 'test'), { recursive: true });

      // Copy Hardhat config
      await cp(
        join(__dirname, 'templates', 'hardhat.config.js'),
        join(workDir, 'hardhat.config.js')
      );

      // Create sample contract
      const sampleContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ${name}Token is ERC20 {
    constructor() ERC20("${name}", "${name.substring(0, 3).toUpperCase()}") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}`;

      await writeFile(
        join(workDir, 'contracts', `${name}Token.sol`),
        sampleContract
      );

      // Create deployment script
      const deployScript = `import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const token = await ethers.deployContract("${name}Token");
  await token.waitForDeployment();

  console.log("Token deployed to:", await token.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });`;

      await writeFile(
        join(workDir, 'scripts', 'deploy.js'),
        deployScript
      );

      return true;
    } catch (err) {
      console.error('Failed to setup Hardhat project:', err);
      return false;
    }
  }

  async create(name, command, args = []) {
    const id = uuidv4();
    const workDir = join(this.appsDir, id);
    
    try {
      await mkdir(workDir, { recursive: true });
      
      const manifest = {
        id,
        name,
        command,
        args,
        created: new Date().toISOString(),
        workDir
      };
      
      await writeFile(
        join(workDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Setup Hardhat project if requested
      if (command === 'hardhat') {
        await this.setupHardhatProject(workDir, name);
      }

      const process = spawn(command, args, {
        cwd: workDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          PATH: `${workDir}/node_modules/.bin:${process.env.PATH}`
        }
      });

      process.stdout.on('data', (data) => {
        console.log(`[${name}] ${data.toString().trim()}`);
      });

      process.stderr.on('data', (data) => {
        console.error(`[${name}] Error: ${data.toString().trim()}`);
      });

      process.on('close', (code) => {
        console.log(`[${name}] Process exited with code ${code}`);
        this.apps.delete(id);
      });

      this.apps.set(id, {
        ...manifest,
        process
      });

      console.log(`🚀 Created dApp: ${name} (${id})`);
      return id;
    } catch (err) {
      console.error(`Failed to create dApp ${name}:`, err);
      throw err;
    }
  }

  async stop(id) {
    const app = this.apps.get(id);
    if (!app) {
      throw new Error(`dApp ${id} not found`);
    }

    try {
      const children = await psList(app.process.pid);
      
      children.forEach(child => {
        try {
          process.kill(child.PID);
        } catch (err) {
          console.error(`Failed to kill child process ${child.PID}:`, err);
        }
      });

      app.process.kill();
      this.apps.delete(id);
      console.log(`🛑 Stopped dApp: ${app.name} (${id})`);
    } catch (err) {
      console.error(`Failed to stop dApp ${id}:`, err);
      throw err;
    }
  }

  async remove(id) {
    try {
      if (this.apps.has(id)) {
        await this.stop(id);
      }

      await rm(join(this.appsDir, id), { recursive: true, force: true });
      console.log(`🗑️  Removed dApp: ${id}`);
    } catch (err) {
      console.error(`Failed to remove dApp ${id}:`, err);
      throw err;
    }
  }

  list() {
    const apps = [];
    for (const [id, app] of this.apps) {
      apps.push({
        id,
        name: app.name,
        command: app.command,
        args: app.args,
        created: app.created,
        status: app.process.killed ? 'stopped' : 'running',
        pid: app.process.pid
      });
    }
    return apps;
  }
}

// Create Express app
const app = express();
const factory = new DAppFactory();

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

app.get('/api/apps', (req, res) => {
  res.json(factory.list());
});

app.post('/api/apps', async (req, res) => {
  try {
    const { name, command, args } = req.body;
    const id = await factory.create(name, command, args);
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/apps/:id', async (req, res) => {
  try {
    await factory.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/apps/:id/stop', async (req, res) => {
  try {
    await factory.stop(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
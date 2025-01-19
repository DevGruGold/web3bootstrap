#!/usr/bin/env node
import { program } from 'commander';
import { DAppFactory } from './index.js';

const factory = new DAppFactory();

program
  .name('dapp')
  .description('dApp Factory CLI')
  .version('1.0.0');

program
  .command('create')
  .description('Create a new dApp')
  .argument('<name>', 'name of the dApp')
  .argument('<command>', 'command to run')
  .argument('[args...]', 'command arguments')
  .action(async (name, command, args) => {
    try {
      const id = await factory.create(name, command, args);
      console.log(`Created dApp ${name} with ID: ${id}`);
    } catch (err) {
      console.error('Failed to create dApp:', err);
    }
  });

program
  .command('list')
  .description('List all running dApps')
  .action(() => {
    console.table(factory.list());
  });

program
  .command('stop')
  .description('Stop a running dApp')
  .argument('<id>', 'dApp ID')
  .action(async (id) => {
    try {
      await factory.stop(id);
      console.log(`Stopped dApp ${id}`);
    } catch (err) {
      console.error('Failed to stop dApp:', err);
    }
  });

program
  .command('remove')
  .description('Remove a dApp')
  .argument('<id>', 'dApp ID')
  .action(async (id) => {
    try {
      await factory.remove(id);
      console.log(`Removed dApp ${id}`);
    } catch (err) {
      console.error('Failed to remove dApp:', err);
    }
  });

program.parse();
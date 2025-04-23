#!/usr/bin/env node
require('dotenv').config(); // Load environment variables from .env file
// Runs `sequelize db:migrate` then `sequelize db:seed:all` with the
// same config file CI uses (config/config.ci.json).

const { spawnSync } = require('child_process');
const path          = require('path');

const spawnOpts = { stdio: 'inherit', shell: true };

const args = [
  'db:migrate',
  '--env',     'development',
  '--config',  path.join('config', 'config.ci.json')
];
const seedArgs = [
  'db:seed:all',
  '--env',     'development',
  '--config',  path.join('config', 'config.ci.json')
];

function run(cmdArgs, label) {
  console.log(`\n▶ ${label} …`);
  const { status } = spawnSync('npx', ['sequelize-cli', ...cmdArgs], spawnOpts);
  if (status !== 0) {
    console.error(`${label} failed (exit ${status})`);
    process.exit(status);
  }
}

run(args,      'Running migrations');
run(seedArgs,  'Seeding database');
console.log('✓ DB schema & seed in place');
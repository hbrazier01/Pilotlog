#!/usr/bin/env node

const childProcess = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const [_node, _script, ...args] = process.argv;

// Function to find the compact binary
function findCompactBinary() {
  // First check if compact is in PATH
  try {
    const result = childProcess.execSync('which compact', { encoding: 'utf8' }).trim();
    if (result && fs.existsSync(result)) {
      return result;
    }
  } catch (error) {
    // compact not found in PATH, continue searching
  }

  // Check common install locations based on the new installer
  const homeDir = os.homedir();
  const possiblePaths = [
    // XDG_BIN_HOME
    process.env.XDG_BIN_HOME && path.join(process.env.XDG_BIN_HOME, 'compact'),
    // XDG_DATA_HOME/../bin
    process.env.XDG_DATA_HOME && path.join(process.env.XDG_DATA_HOME, '..', 'bin', 'compact'),
    // $HOME/.local/bin (most common)
    path.join(homeDir, '.local', 'bin', 'compact'),
    // Legacy COMPACT_HOME support (if still set)
    process.env.COMPACT_HOME && path.join(process.env.COMPACT_HOME, 'compact'),
    process.env.COMPACT_HOME && path.join(process.env.COMPACT_HOME, 'compactc'), // old binary name
  ].filter(Boolean);

  for (const compactPath of possiblePaths) {
    if (fs.existsSync(compactPath)) {
      return compactPath;
    }
  }

  return null;
}

// Find the compact binary
const compactPath = findCompactBinary();

if (!compactPath) {
  console.error('Error: compact binary not found.');
  console.error('Please ensure compact is installed and available in your PATH.');
  console.error("You can install it using: curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh");
  process.exit(1);
}

console.log(`Using compact from: ${compactPath}`);

// yarn runs everything with node...
const child = childProcess.spawn(compactPath, args, {
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (code === 0) {
    process.exit(0);
  } else {
    process.exit(code ?? signal);
  }
})

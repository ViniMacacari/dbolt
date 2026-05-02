const fs = require('node:fs/promises');
const path = require('node:path');

const installerDir = path.join(__dirname, '..', 'dist', 'installer');

const artifactGroups = [
  {
    directory: 'appimage',
    matcher: (name) => name.endsWith('.AppImage') || name === 'latest-linux.yml'
  },
  {
    directory: 'deb',
    matcher: (name) => name.endsWith('.deb')
  },
  {
    directory: 'rpm',
    matcher: (name) => name.endsWith('.rpm')
  },
  {
    directory: 'unpacked',
    matcher: (name) => name === 'linux-unpacked'
  },
  {
    directory: 'meta',
    matcher: (name) =>
      name === 'builder-debug.yml' || name === 'builder-effective-config.yaml'
  }
];

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function moveEntry(sourcePath, targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
  await fs.rename(sourcePath, targetPath);
}

async function organizeArtifacts() {
  const entries = await fs.readdir(installerDir, { withFileTypes: true });

  for (const entry of entries) {
    const group = artifactGroups.find(({ matcher }) => matcher(entry.name));

    if (!group) {
      continue;
    }

    const targetDirectory = path.join(installerDir, group.directory);
    const sourcePath = path.join(installerDir, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    await ensureDirectory(targetDirectory);

    if (sourcePath === targetPath) {
      continue;
    }

    await moveEntry(sourcePath, targetPath);
  }
}

organizeArtifacts().catch((error) => {
  console.error('Failed to organize Linux artifacts:', error);
  process.exit(1);
});

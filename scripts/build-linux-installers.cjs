const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const cacheDir = '/tmp/electron-builder-cache';
const linuxIconSource = path.join(projectRoot, 'public', 'icons', 'dbolt-square.png');
const linuxIconDir = path.join(projectRoot, 'build', 'linux-icons');
const linuxIconSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: cacheDir
    }
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasCommand(command) {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], {
    cwd: projectRoot,
    stdio: 'ignore'
  });

  return result.status === 0;
}

async function prepareLinuxIcons() {
  await fs.mkdir(linuxIconDir, { recursive: true });

  await Promise.all(
    linuxIconSizes.map((size) =>
      fs.copyFile(linuxIconSource, path.join(linuxIconDir, `${size}x${size}.png`))
    )
  );
}

async function main() {
  await prepareLinuxIcons();

  const linuxTargets = ['AppImage', 'deb'];

  if (hasCommand('rpmbuild')) {
    linuxTargets.push('rpm');
  } else {
    console.warn(
      'Skipping RPM build because `rpmbuild` is not installed. Install it with `sudo apt-get install rpm` to generate .rpm packages.'
    );
  }

  run('npx', ['electron-builder', '--linux', ...linuxTargets]);
  run('node', ['scripts/organize-linux-artifacts.cjs']);
}

main().catch((error) => {
  console.error('Failed to prepare Linux build assets:', error);
  process.exit(1);
});

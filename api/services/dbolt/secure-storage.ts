import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ENCRYPTED_VALUE_PREFIX = 'dbolt+dpapi:v1:';
const DPAPI_ENTROPY = 'dbolt-credential-storage';
const POWERSHELL_EXECUTABLE = 'powershell.exe';

class SecureStorageService {
  async encryptString(value: string): Promise<string> {
    this.ensureSupportedPlatform();

    const plaintextBase64 = Buffer.from(value, 'utf8').toString('base64');
    const encryptedBase64 = await this.runPowerShell(
      [
        'Add-Type -AssemblyName System.Security',
        `$inputBytes = [Convert]::FromBase64String('${plaintextBase64}')`,
        `$entropyBytes = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')`,
        '$protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(' +
          '$inputBytes, $entropyBytes, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
        '[Console]::Out.Write([Convert]::ToBase64String($protectedBytes))'
      ].join('; ')
    );

    return `${ENCRYPTED_VALUE_PREFIX}${encryptedBase64}`;
  }

  async decryptString(value: string): Promise<string> {
    if (!this.isEncrypted(value)) {
      return value;
    }

    this.ensureSupportedPlatform();

    try {
      const encryptedBase64 = value.slice(ENCRYPTED_VALUE_PREFIX.length);
      const plaintextBase64 = await this.runPowerShell(
        [
          'Add-Type -AssemblyName System.Security',
          `$protectedBytes = [Convert]::FromBase64String('${encryptedBase64}')`,
          `$entropyBytes = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')`,
          '$plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(' +
            '$protectedBytes, $entropyBytes, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
          '[Console]::Out.Write([Convert]::ToBase64String($plainBytes))'
        ].join('; ')
      );

      return Buffer.from(plaintextBase64, 'base64').toString('utf8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to decrypt saved credential: ${message}`);
    }
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_VALUE_PREFIX);
  }

  private ensureSupportedPlatform(): void {
    if (process.platform !== 'win32') {
      throw new Error(
        'Secure credential storage is currently supported only on Windows.'
      );
    }
  }

  private async runPowerShell(script: string): Promise<string> {
    const { stdout, stderr } = await execFileAsync(
      POWERSHELL_EXECUTABLE,
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );

    const output = stdout.trim();

    if (!output) {
      const errorMessage = stderr.trim() || 'PowerShell returned an empty result.';
      throw new Error(errorMessage);
    }

    return output;
  }
}

export default new SecureStorageService();

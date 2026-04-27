import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ENCRYPTED_VALUE_PREFIX = 'dbolt+dpapi:v1:';
const DPAPI_ENTROPY = 'dbolt-credential-storage';
const POWERSHELL_EXECUTABLE = 'powershell.exe';

class SecureStorageService {
  async encryptString(value: string): Promise<string> {
    const encryptedValues = await this.encryptStrings([value]);
    const encryptedValue = encryptedValues[0];

    if (!encryptedValue) {
      throw new Error('Failed to encrypt credential.');
    }

    return encryptedValue;
  }

  async decryptString(value: string): Promise<string> {
    try {
      const decryptedValues = await this.decryptStrings([value]);
      const decryptedValue = decryptedValues[0];

      if (decryptedValue === undefined) {
        throw new Error('PowerShell returned an empty result.');
      }

      return decryptedValue;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to decrypt saved credential: ${message}`);
    }
  }

  async encryptStrings(values: string[]): Promise<string[]> {
    if (values.length === 0) {
      return [];
    }

    this.ensureSupportedPlatform();

    const plaintextBase64Values = values.map((value) =>
      Buffer.from(value, 'utf8').toString('base64')
    );
    const encryptedBase64Values = await this.protectBase64Values(
      plaintextBase64Values
    );

    return encryptedBase64Values.map(
      (encryptedBase64) => `${ENCRYPTED_VALUE_PREFIX}${encryptedBase64}`
    );
  }

  async decryptStrings(values: string[]): Promise<string[]> {
    if (values.length === 0) {
      return [];
    }

    const decryptedValues = [...values];
    const encryptedIndexes: number[] = [];
    const encryptedBase64Values: string[] = [];

    values.forEach((value, index) => {
      if (!this.isEncrypted(value)) {
        return;
      }

      encryptedIndexes.push(index);
      encryptedBase64Values.push(value.slice(ENCRYPTED_VALUE_PREFIX.length));
    });

    if (encryptedBase64Values.length === 0) {
      return decryptedValues;
    }

    this.ensureSupportedPlatform();

    const plaintextBase64Values = await this.unprotectBase64Values(
      encryptedBase64Values
    );

    plaintextBase64Values.forEach((plaintextBase64, resultIndex) => {
      const valueIndex = encryptedIndexes[resultIndex];

      if (valueIndex === undefined) {
        return;
      }

      decryptedValues[valueIndex] = Buffer.from(
        plaintextBase64,
        'base64'
      ).toString('utf8');
    });

    return decryptedValues;
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

  private async protectBase64Values(values: string[]): Promise<string[]> {
    return this.runDpapiBatch(
      values,
      '$inputBytes = [Convert]::FromBase64String($item); ' +
        '$protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(' +
        '$inputBytes, $entropyBytes, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); ' +
        '[Convert]::ToBase64String($protectedBytes)'
    );
  }

  private async unprotectBase64Values(values: string[]): Promise<string[]> {
    return this.runDpapiBatch(
      values,
      '$protectedBytes = [Convert]::FromBase64String($item); ' +
        '$plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(' +
        '$protectedBytes, $entropyBytes, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); ' +
        '[Convert]::ToBase64String($plainBytes)'
    );
  }

  private async runDpapiBatch(
    base64Values: string[],
    operationScript: string
  ): Promise<string[]> {
    if (base64Values.length === 0) {
      return [];
    }

    const output = await this.runPowerShell(
      [
        'Add-Type -AssemblyName System.Security',
        `$items = ${this.toPowerShellStringArray(base64Values)}`,
        `$entropyBytes = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')`,
        `$results = foreach ($item in $items) { ${operationScript} }`,
        '$resultArray = @($results)',
        '[Console]::Out.Write(' +
          `'[' + (($resultArray | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'` +
          ')'
      ].join('; ')
    );

    const parsed = JSON.parse(output) as unknown;

    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => typeof item === 'string')
    ) {
      throw new Error('PowerShell returned an invalid credential payload.');
    }

    if (parsed.length !== base64Values.length) {
      throw new Error('PowerShell returned an incomplete credential payload.');
    }

    return parsed;
  }

  private toPowerShellStringArray(values: string[]): string {
    return `@(${values.map((value) => `'${value}'`).join(',')})`;
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

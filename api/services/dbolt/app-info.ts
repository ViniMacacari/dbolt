import fs from 'node:fs';
import path from 'node:path';

export interface AppInfo {
  name: string;
  productName: string;
  version: string;
}

class AppInfoService {
  private readonly fallbackInfo: AppInfo = {
    name: 'dbolt',
    productName: 'DBolt Database Manager',
    version: '0.0.0'
  };

  getAppInfo(): AppInfo {
    return this.readGeneratedAppInfo() ?? this.readRootPackageInfo() ?? this.fallbackInfo;
  }

  private readGeneratedAppInfo(): AppInfo | null {
    const appInfoPath = path.resolve(__dirname, '..', '..', '..', 'app-info.json');
    return this.readAppInfoFile(appInfoPath);
  }

  private readRootPackageInfo(): AppInfo | null {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const packageInfo = this.readJsonFile(packageJsonPath);

    if (!packageInfo || typeof packageInfo['version'] !== 'string') {
      return null;
    }

    return {
      name: typeof packageInfo['name'] === 'string' ? packageInfo['name'] : this.fallbackInfo.name,
      productName: this.getProductName(packageInfo),
      version: packageInfo['version']
    };
  }

  private readAppInfoFile(filePath: string): AppInfo | null {
    const appInfo = this.readJsonFile(filePath);

    if (
      !appInfo ||
      typeof appInfo['name'] !== 'string' ||
      typeof appInfo['productName'] !== 'string' ||
      typeof appInfo['version'] !== 'string'
    ) {
      return null;
    }

    return {
      name: appInfo['name'],
      productName: appInfo['productName'],
      version: appInfo['version']
    };
  }

  private readJsonFile(filePath: string): Record<string, unknown> | null {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private getProductName(packageInfo: Record<string, unknown>): string {
    const build = packageInfo['build'];

    if (
      typeof build === 'object' &&
      build !== null &&
      'productName' in build &&
      typeof build.productName === 'string'
    ) {
      return build.productName;
    }

    return typeof packageInfo['name'] === 'string'
      ? packageInfo['name']
      : this.fallbackInfo.productName;
  }
}

export default new AppInfoService();

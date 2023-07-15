import { Injectable } from '@nestjs/common';
import {
  setIntervalAsync,
  clearIntervalAsync,
} from 'set-interval-async/dynamic';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const os = require('os');
import { spawn } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { BrowserLauncherService } from './browser-launcher.service';

@Injectable()
export class BrowserScreenService {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  autoRefreshTimer = setIntervalAsync(() => {}, 0);
  autoRefreshSeconds = 0;
  constructor(
    private readonly browserLauncherService: BrowserLauncherService,
  ) {}

  public async screenshot(): Promise<Buffer> {
    const fileName = process.hrtime.bigint() + '.png';
    const filePath = path.join(os.tmpdir(), fileName);
    try {
      const child = spawn('scrot', [filePath]);

      const statusCode = await new Promise((resolve) => {
        child.on('close', resolve);
      });
      if (statusCode === 0) {
        return readFileSync(filePath);
      }
    } catch (e) {
      console.log(e.toString());
    } finally {
      try {
        unlinkSync(filePath);
      } catch (e) {
        console.log(e.toString());
      }
    }
  }

  public async enableAutoRefresh(seconds: number) {
    this.autoRefreshSeconds = seconds;
    await this.setRefreshTimer(this.autoRefreshSeconds * 1000);
  }

  public async disableAutoRefresh() {
    this.autoRefreshSeconds = 0;
    await clearIntervalAsync(this.autoRefreshTimer);
  }
  public isAutoRefreshIntervalValid(refreshInterval: string) {
    if (/\D/.test(refreshInterval)) {
      throw new Error(
        `Provided interval : "${refreshInterval}\" doesnt contain only numeric characters`,
      );
    } else {
      return parseInt(refreshInterval, 10);
    }
  }
  private async setRefreshTimer(refreshInterval: number) {
    this.autoRefreshTimer = setIntervalAsync(async () => {
      try {
        await this.browserLauncherService.refreshBrowser();
      } catch (err) {
        console.log('Timer error: ', err);
        process.exit(1);
      }
    }, refreshInterval);
  }
}

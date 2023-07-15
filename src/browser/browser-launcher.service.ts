import { Injectable } from '@nestjs/common';
import { BrowserUrlService } from './browser-url.service';
import { BrowserFlagsService } from './browser-flags.service';
import { BrowserKioskService } from './browser-kiosk.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chromeLauncher = require('chrome-launcher');

@Injectable()
export class BrowserLauncherService {
  private browserDebugPort =
    parseInt(process.env.REMOTE_DEBUG_PORT, 10) || 35173;
  private isBrowserDataPersistent = parseInt(process.env.PERSISTENT, 10) || 0;
  constructor(
    private browserUrlService: BrowserUrlService,
    private readonly browserFlagsService: BrowserFlagsService,
    private readonly browserKioskService: BrowserKioskService,
  ) {}
  public async launchChromium(url: string) {
    await chromeLauncher.killAll();
    await this.browserUrlService.setUrl(url);
    this.browserFlagsService.setBrowserFlags();
    let startingUrl = this.browserUrlService.browserUrl;
    if (this.browserKioskService.kioskMode) {
      startingUrl = `--app= ${this.browserUrlService.browserUrl}`;
    }

    console.debug(
      `Starting Chromium with flags: ${this.browserFlagsService.browserFlags}`,
    );
    console.log(`Displaying URL: ${startingUrl}`);

    await chromeLauncher.launch({
      startingUrl,
      ignoreDefaultFlags: true,
      chromeFlags: this.browserFlagsService.browserFlags,
      port: this.browserDebugPort,
      userDataDir: this.isBrowserDataPersistent ? '/data/chromium' : undefined,
    });
  }
  public async refreshBrowser() {
    this.launchChromium(this.browserUrlService.browserUrl);
    return { browserUrl: this.browserUrlService.browserUrl };
  }
}

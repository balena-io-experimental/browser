import { Injectable, OnModuleInit } from '@nestjs/common';
import { BrowserUrlService } from './browser/browser-url.service';
import { BrowserLauncherService } from './browser/browser-launcher.service';

@Injectable()
export class AppService implements OnModuleInit {
  version = process.env.VERSION || 'Version not set';
  constructor(
    private browserUrlService: BrowserUrlService,
    private browserLauncherService: BrowserLauncherService,
  ) {}
  async onModuleInit() {
    await this.browserLauncherService.launchChromium(
      this.browserUrlService.browserUrl,
    );
  }
}

import { Module } from '@nestjs/common';
import { BrowserService } from './browser.service';
import { BrowserController } from './browser.controller';
import { BrowserUrlService } from './browser-url.service';
import { BrowserFlagsService } from './browser-flags.service';
import { BrowserGpuService } from './browser-gpu.service';
import { BrowserKioskService } from './browser-kiosk.service';
import { BrowserLauncherService } from './browser-launcher.service';
import { BrowserKioskModeController } from './browser-kiosk.controller';
import { BrowserUrlController } from './browser-url.controller';
import { BrowserLauncherController } from './browser-launcher.controller';
import { BrowserGpuController } from './browser-gpu.controller';
import { BrowserFlagsController } from './browser-flags.controller';
import { BrowserScreenService } from './browser-screen.service';
import { BrowserScreenController } from './browser-screen.controller';

@Module({
  controllers: [
    BrowserScreenController,
    BrowserFlagsController,
    BrowserGpuController,
    BrowserLauncherController,
    BrowserUrlController,
    BrowserKioskModeController,
    BrowserController,
  ],
  providers: [
    BrowserScreenService,
    BrowserLauncherService,
    BrowserKioskService,
    BrowserGpuService,
    BrowserFlagsService,
    BrowserUrlService,
    BrowserService,
  ],
})
export class BrowserModule {}

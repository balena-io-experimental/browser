import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BrowserModule } from './browser/browser.module';
import { HealthModule } from './health/health.module';
import { BrowserUrlService } from './browser/browser-url.service';
import { BrowserLauncherService } from './browser/browser-launcher.service';
import { BrowserFlagsService } from './browser/browser-flags.service';
import { BrowserKioskService } from './browser/browser-kiosk.service';
import { BrowserGpuService } from './browser/browser-gpu.service';
import { BrowserUrlController } from './browser/browser-url.controller';
import { BrowserLauncherController } from './browser/browser-launcher.controller';
import { BrowserGpuController } from './browser/browser-gpu.controller';

@Module({
  imports: [BrowserModule, HealthModule],
  controllers: [
    BrowserGpuController,
    BrowserLauncherController,
    BrowserUrlController,
    AppController,
  ],
  providers: [
    AppService,
    BrowserLauncherService,
    BrowserKioskService,
    BrowserGpuService,
    BrowserFlagsService,
    BrowserUrlService,
  ],
})
export class AppModule {}

import { Controller, Get } from '@nestjs/common';
import { BrowserUrlService } from './browser-url.service';
import { BrowserLauncherService } from './browser-launcher.service';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Browser Managment')
@Controller('')
export class BrowserController {
  constructor(
    private readonly browserUrlsService: BrowserUrlService,
    private readonly browserLauncherService: BrowserLauncherService,
  ) {}
  @Get('/scan')
  @ApiResponse({
    status: 200,
    description: 'Indicates, the request was successful.',
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  scanForAvailableUrls(): Promise<string[]> | any {
    const possibleUrls = this.browserUrlsService.scanPortsForPossibleUrls();
    this.browserLauncherService.launchChromium(possibleUrls[0]);
    return possibleUrls;
  }
  @Get('/ping')
  @ApiResponse({
    status: 200,
    description: 'Indicates, the request was successful.',
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  getPing(): any {
    return { status: 'ok' };
  }
}

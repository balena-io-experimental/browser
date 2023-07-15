import { Controller, Get } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { BrowserLauncherService } from './browser-launcher.service';
import { browserUrl } from './interfaces/browser.interfaces';

@ApiTags('Browser Managment')
@Controller('')
export class BrowserLauncherController {
  constructor(
    private readonly browserLauncherService: BrowserLauncherService,
  ) {}
  @Get('/refresh')
  @ApiResponse({
    status: 200,
    description: 'Indicates, the request was successful.',
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  refreshBrowser(): Promise<browserUrl> {
    return this.browserLauncherService.refreshBrowser();
  }
}

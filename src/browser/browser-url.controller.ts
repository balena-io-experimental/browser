import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BrowserLauncherService } from './browser-launcher.service';
import { BrowserUrlService } from './browser-url.service';
import { ChangeUrlDto } from './dto/changeUrl.dto';
import { browserUrl } from './interfaces/browser.interfaces';

@ApiTags('Browser Managment')
@Controller('')
export class BrowserUrlController {
  constructor(
    private readonly browserLauncherService: BrowserLauncherService,
    private readonly browserUrlService: BrowserUrlService,
  ) {}
  @Get('/url')
  @ApiResponse({
    status: 200,
    description: 'Indicates, the request was successful.',
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  getKioskUrl(): browserUrl {
    return { browserUrl: this.browserUrlService.browserUrl };
  }
  @Post('/url')
  @ApiResponse({
    status: 201,
    description: 'Indicates, the request was successful.',
  })
  @ApiBody({
    type: ChangeUrlDto,
    description: 'Desired url for browser. ',
    required: true,
    examples: {
      httpServer: {
        value: {
          url: 'http://www.balena.io',
        },
        description: 'Example to change url to open a webpage in browser',
      },
    },
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  async setKioskUrl(@Body() changeUrlDto: ChangeUrlDto): Promise<browserUrl> {
    console.log(this.browserUrlService.browserUrl);
    await this.browserLauncherService.launchChromium(changeUrlDto.url);
    return { browserUrl: this.browserUrlService.browserUrl };
  }
}

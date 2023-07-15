import { Controller, Get } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { BrowserFlagsService } from './browser-flags.service';

@ApiTags('Browser Managment')
@Controller('')
export class BrowserFlagsController {
  constructor(private readonly browserFlagsService: BrowserFlagsService) {}
  @Get('/flags')
  @ApiResponse({
    status: 200,
    description: 'Successfully get browser flags.',
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  getGpuState(): any {
    return { flags: this.browserFlagsService.browserFlags };
  }
}

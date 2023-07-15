import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { BrowserLauncherService } from './browser-launcher.service';
import { BrowserGpuService } from './browser-gpu.service';
import { gpuState } from './interfaces/browser.interfaces';
import { BrowserUrlService } from './browser-url.service';

@ApiTags('Browser Managment')
@Controller('')
export class BrowserGpuController {
  constructor(
    private readonly browserLauncherService: BrowserLauncherService,
    private readonly browserGpuService: BrowserGpuService,
    private readonly browserUrlService: BrowserUrlService,
  ) {}
  @Get('/gpu')
  @ApiResponse({
    status: 200,
    description: 'Successfully get kiosk gpu current state.',
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  getGpuState(): gpuState {
    return { gpuState: this.browserGpuService.gpuState };
  }
  @Post('/gpu/:gpu')
  @ApiResponse({
    status: 201,
    description: 'Successfully put kiosk in desired mode.',
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  setGpuState(@Param('gpu') gpu: string): gpuState {
    const gpuState = parseInt(gpu, 10);
    if (gpuState <= 0 || gpuState > 1) {
      this.browserGpuService.setGpuState(false);
    } else {
      this.browserGpuService.setGpuState(true);
    }
    this.browserLauncherService.refreshBrowser();
    return { gpuState: this.browserGpuService.gpuState };
  }
}

import {
  Controller,
  Get,
  Post,
  Param,
  HttpException,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { BrowserKioskService } from './browser-kiosk.service';

import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { BrowserLauncherService } from './browser-launcher.service';
import { kioskMode } from './interfaces/browser.interfaces';

@ApiTags('Browser Managment')
@Controller('')
export class BrowserKioskModeController {
  constructor(
    private readonly browserKioskService: BrowserKioskService,
    private readonly browserLauncherService: BrowserLauncherService,
  ) {}
  @Get('/kiosk')
  @ApiResponse({
    status: 200,
    description: 'Indicates, the request was successful.',
  })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  getKioskMode(): kioskMode {
    return { kioskMode: this.browserKioskService.kioskMode };
  }

  @Post('/kiosk/:kiosk')
  @ApiResponse({
    status: 201,
    description: 'Successfully put kiosk in desired mode.',
  })
  @ApiResponse({ status: 422, description: 'Malformed Interval.' })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  setKioskMode(@Param('kiosk') kiosk: string): kioskMode {
    try {
      if (/\D/.test(kiosk)) {
        throw new Error(
          `Provided value of kiosk : "${kiosk}" doesnt contain only numeric characters`,
        );
      }
      const kioskMode = parseInt(kiosk, 10);
      if (kioskMode <= 0 || kioskMode > 1) {
        this.browserKioskService.setKioskMode(false);
      } else {
        this.browserKioskService.setKioskMode(true);
      }
      this.browserLauncherService.refreshBrowser();
      return { kioskMode: this.browserKioskService.kioskMode };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }
  @Put('/kiosk/:kiosk')
  @ApiResponse({
    status: 201,
    description: 'Successfully put kiosk in desired mode.',
  })
  @ApiResponse({ status: 422, description: 'Malformed Interval.' })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  putKioskInMode(@Param('kiosk') kiosk: string): kioskMode {
    try {
      if (/\D/.test(kiosk)) {
        throw new Error(
          `Provided value of kiosk : "${kiosk}" doesnt contain only numeric characters`,
        );
      }
      const kioskMode = parseInt(kiosk, 10);
      if (kioskMode <= 0 || kioskMode > 1) {
        this.browserKioskService.setKioskMode(false);
      } else {
        this.browserKioskService.setKioskMode(true);
      }
      this.browserLauncherService.refreshBrowser();
      return { kioskMode: this.browserKioskService.kioskMode };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }
}

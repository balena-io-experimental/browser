import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { BrowserScreenService } from './browser-screen.service';
import { Response } from 'express';

@ApiTags('Browser Managment')
@Controller('')
@Injectable()
export class BrowserScreenController {
  constructor(private browserScreenService: BrowserScreenService) {}
  @Get('/screenshot')
  @ApiResponse({
    status: 200,
    description: 'Successfully captured a screenshot of browser.',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  async getScreenshot(@Res() res: Response): Promise<any> {
    try {
      const buffer = await this.browserScreenService.screenshot();
      return res.status(200).contentType('image/png').send(buffer);
    } catch (err) {
      return res.status(500).json(err);
    }
  }

  @Get('/autorefresh')
  @ApiResponse({
    status: 200,
    description: 'Returns current autorefresh interval.',
  })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  async getAutoRefreshInterval(): Promise<any> {
    return {
      refreshIntervalInSeconds: this.browserScreenService.autoRefreshSeconds,
    };
  }

  @Post('/autorefresh/:interval')
  @ApiResponse({
    status: 201,
    description: 'Successfully enabled or disabled the auto refresh timer.',
  })
  @ApiResponse({ status: 422, description: 'Malformed Interval.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error.' })
  @ApiResponse({ status: 502, description: 'Bad Gateway.' })
  @ApiResponse({ status: 503, description: 'Service Unavailable.' })
  async autoRefresh(@Param('interval') interval: string): Promise<any> {
    try {
      const intervalSeconds =
        this.browserScreenService.isAutoRefreshIntervalValid(interval);
      if (intervalSeconds < 1) {
        this.browserScreenService.disableAutoRefresh();
      } else {
        this.browserScreenService.enableAutoRefresh(intervalSeconds);
      }
      return {
        refreshIntervalInSeconds: this.browserScreenService.autoRefreshSeconds,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }
}

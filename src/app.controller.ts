import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Browser Managment')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
  @Get('/version')
  @ApiResponse({
    status: 200,
    description: 'Successfully get kiosk gpu current state.',
  })
  getBrowserVersion(): { version: string } {
    return { version: this.appService.version };
  }
}

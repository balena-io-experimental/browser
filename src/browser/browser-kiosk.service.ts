import { Injectable } from '@nestjs/common';

@Injectable()
export class BrowserKioskService {
  kioskMode = parseInt(process.env.KIOSK, 10) ? true : false || false;
  public enableKioskMode() {
    this.setKioskMode(true);
    return { success: true };
  }
  public disableKioskMode() {
    this.setKioskMode(false);
    return { success: true };
  }
  public setKioskMode(mode: boolean) {
    this.kioskMode = mode;
  }
}

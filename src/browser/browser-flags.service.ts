import { Injectable, OnModuleInit } from '@nestjs/common';
import { BrowserGpuService } from './browser-gpu.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chromeLauncher = require('chrome-launcher');

@Injectable()
export class BrowserFlagsService implements OnModuleInit {
  browserFlags = [];
  private windowSize = process.env.WINDOW_SIZE || '800,600';
  private windowPosition = process.env.WINDOW_POSITION || '0,0';
  private defaultFlags = [
    '--window-size=' + this.windowSize,
    '--window-position=' + this.windowPosition,
    '--autoplay-policy=no-user-gesture-required',
    '--noerrdialogs',
    '--disable-session-crashed-bubble',
    '--check-for-update-interval=31536000',
    '--disable-dev-shm-usage', // TODO: work out if we can enable this for devices with >1Gb of memory
  ];
  private userDefinedFlags = process.env.FLAGS || null;
  constructor(private readonly browserGpuService: BrowserGpuService) {}

  public setBrowserFlags() {
    if (this.userDefinedFlags !== null) {
      this.browserFlags = this.userDefinedFlags.split(' ');
    } else {
      const defaultChromiumFlags =
        chromeLauncher.Launcher.defaultFlags().filter(
          (flag: string) =>
            '--disable-extensions' !== flag && '--mute-audio' !== flag,
        );

      this.defaultFlags = Array.from(
        new Set([...this.defaultFlags, ...defaultChromiumFlags]),
      );
      if (!this.browserGpuService.gpuState) {
        this.browserFlags = this.defaultFlags.concat(
          this.browserGpuService.disableGpuFlags,
        );
      } else {
        this.browserFlags = this.defaultFlags.concat(
          this.browserGpuService.enableGpuFlags,
        );
      }
    }
  }
  async onModuleInit() {
    try {
      this.setBrowserFlags();
    } catch (err) {
      process.exit(1);
    }
  }
}

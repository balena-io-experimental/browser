import { Injectable } from '@nestjs/common';

@Injectable()
export class BrowserGpuService {
  gpuState = parseInt(process.env.ENABLE_GPU, 10) ? true : false || false;
  enableGpuFlags = [
    '--enable-zero-copy',
    '--num-raster-threads=4',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ];
  disableGpuFlags = ['--disable-gpu'];
  public setGpuState(state: boolean) {
    this.gpuState = state;
  }
}

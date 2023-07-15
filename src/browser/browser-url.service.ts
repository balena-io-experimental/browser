import { Injectable } from '@nestjs/common';
import { browserUrl } from './interfaces/browser.interfaces';

@Injectable()
export class BrowserUrlService {
  private isHttpUrleRegEx = /^https?:\/\//i; //regex for HTTP/S prefix
  private isFileUrlRegEx = /^file:\/\/\//i; //regex for HTTP/S prefix
  private fallbackUrl = 'file:///home/chromium/index.html';
  browserUrl = process.env.LAUNCH_URL || null;
  private sanitizeUrl(url: string) {
    if (url === null) {
      return this.fallbackUrl;
    }
    if (!this.isHttpUrleRegEx.test(url)) {
      return `http://${url}`;
    } else if (this.isHttpUrleRegEx.test(url)) {
      return url;
    } else {
      return this.fallbackUrl;
    }
  }
  public async setUrl(url: string): Promise<browserUrl> {
    if (this.browserUrl !== null) {
      this.browserUrl = this.sanitizeUrl(url);
      return { browserUrl: this.browserUrl };
    } else {
      const availableUrls = await this.scanPortsForPossibleUrls();
      if (availableUrls.length > 0) {
        this.browserUrl = this.sanitizeUrl(availableUrls[0]);
      } else {
        // In case of failed scan it will use a fallback url
        this.browserUrl = this.fallbackUrl;
      }
      return { browserUrl: this.browserUrl };
    }
  }
  public async scanPortsForPossibleUrls(): Promise<Array<string>> {
    const ports = [80, 443, 8080];
    const urls: Array<string> = [];
    for (const port of ports) {
      const protocol = 443 === port ? `https` : `http`;
      const url = `${protocol}://localhost:${port}`;
      const request = fetch(url);
      await request
        .then((res) => {
          console.log(`Trying local port ${port}`);
          if (res.status === 200) {
            console.log('HTTP/S service found at: ' + url);
            urls.push(url);
          }
        })
        .catch((err) => {
          console.log(`No service found on port ${port},${err}`);
        });
    }
    return urls;
  }
}

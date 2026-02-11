import {
  Controller,
  Get,
  Query,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/**
 * ProxyController provides utilities for URL inspection and embeddability checking.
 * Used by the frontend to determine how to display external content (iframe vs popup).
 */
@Controller('proxy')
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  /** Cache embeddability results per origin (TTL: 5 minutes) */
  private embeddableCache = new Map<string, { embeddable: boolean; reason: string; checkedAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  /**
   * Check whether a given URL can be embedded in an iframe.
   * Performs a server-side HEAD request to inspect CSP and X-Frame-Options headers.
   *
   * @param url - The URL to check
   * @returns Embeddability result with headers and recommendation
   */
  @Get('check-embeddable')
  async checkEmbeddable(@Query('url') url: string) {
    if (!url) {
      throw new HttpException('url query parameter is required', HttpStatus.BAD_REQUEST);
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new HttpException('Invalid URL provided', HttpStatus.BAD_REQUEST);
    }

    const origin = parsedUrl.origin;

    // Check cache
    const cached = this.embeddableCache.get(origin);
    if (cached && Date.now() - cached.checkedAt < this.CACHE_TTL_MS) {
      this.logger.debug(`Embeddability check (cached): ${origin} → ${cached.embeddable}`);
      return {
        url,
        origin,
        embeddable: cached.embeddable,
        reason: cached.reason,
        cached: true,
        recommendedMode: cached.embeddable ? 'iframe' : 'popup',
      };
    }

    // Perform server-side HEAD request
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);

      const csp = response.headers.get('content-security-policy') || '';
      const xfo = response.headers.get('x-frame-options') || '';

      const result = this.analyzeHeaders(csp, xfo, origin);

      // Cache result
      this.embeddableCache.set(origin, {
        embeddable: result.embeddable,
        reason: result.reason,
        checkedAt: Date.now(),
      });

      this.logger.log(
        `Embeddability check: ${origin} → ${result.embeddable ? 'EMBEDDABLE' : 'BLOCKED'} (${result.reason})`
      );

      return {
        url,
        origin,
        embeddable: result.embeddable,
        reason: result.reason,
        cached: false,
        recommendedMode: result.embeddable ? 'iframe' : 'popup',
        headers: {
          contentSecurityPolicy: csp || null,
          xFrameOptions: xfo || null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Embeddability check failed for ${origin}: ${message}`);

      return {
        url,
        origin,
        embeddable: false,
        reason: `Could not reach URL: ${message}`,
        cached: false,
        recommendedMode: 'popup',
        headers: null,
      };
    }
  }

  /**
   * Analyze CSP and X-Frame-Options headers to determine if embedding is allowed.
   */
  private analyzeHeaders(
    csp: string,
    xfo: string,
    _origin: string
  ): { embeddable: boolean; reason: string } {
    // Check X-Frame-Options first (simpler)
    const xfoLower = xfo.toLowerCase().trim();
    if (xfoLower === 'deny') {
      return { embeddable: false, reason: 'X-Frame-Options: DENY' };
    }
    if (xfoLower === 'sameorigin') {
      return { embeddable: false, reason: 'X-Frame-Options: SAMEORIGIN (different origin)' };
    }

    // Check CSP frame-ancestors
    const frameAncestorsMatch = csp.match(/frame-ancestors\s+([^;]+)/i);
    if (frameAncestorsMatch) {
      const ancestors = frameAncestorsMatch[1].trim().toLowerCase();

      if (ancestors === "'none'") {
        return { embeddable: false, reason: "CSP frame-ancestors: 'none'" };
      }

      if (ancestors === "'self'") {
        return { embeddable: false, reason: "CSP frame-ancestors: 'self' (different origin)" };
      }

      // If frame-ancestors lists specific domains, our domain probably isn't in it
      // In production, check if our domain is listed
      if (!ancestors.includes('*')) {
        return {
          embeddable: false,
          reason: `CSP frame-ancestors restricted to: ${ancestors}`,
        };
      }
    }

    // No blocking headers found
    if (!csp && !xfo) {
      return { embeddable: true, reason: 'No iframe-blocking headers detected' };
    }

    return { embeddable: true, reason: 'Headers present but do not block iframe embedding' };
  }
}

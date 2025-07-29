import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { ApiService } from '@dua-upd/upd/services';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';

// Module-level cache that persists between component instances
// Cache structure: URL -> { en: results, fr: results }
const accessibilityCache = new Map<string, LocalizedAccessibilityTestResponse>();

interface LocalizedAccessibilityTestResponse {
  en?: AccessibilityTestResponse;
  fr?: AccessibilityTestResponse;
}

interface AccessibilityTestResponse {
  success: boolean;
  data?: {
    desktop: AccessibilityTestResult;
    mobile: AccessibilityTestResult;
  };
  error?: string;
}

interface AccessibilityTestResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  score: number;
  scoreDisplay: string;
  audits: AccessibilityAudit[];
  testedAt: Date;
}

interface AccessibilityAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayMode: string;
  category: 'failed' | 'manual_check' | 'passed' | 'not_applicable';
  snippet?: string;
  helpText?: string;
  selector?: string;
  impact?: string;
  tags?: string[];
  helpUrl?: string;
}

@Component({
    selector: 'upd-page-accessibility',
    templateUrl: './page-accessibility.component.html',
    styleUrls: ['./page-accessibility.component.scss'],
    standalone: false
})
export class PageAccessibilityComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @Input() url: string | null = null;
  @Input() language = 'en-CA';

  @ViewChild('desktopPreviewContainer', { read: ElementRef }) desktopPreviewContainer?: ElementRef<HTMLElement>;
  @ViewChild('mobilePreviewContainer', { read: ElementRef }) mobilePreviewContainer?: ElementRef<HTMLElement>;

  private apiService = inject(ApiService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private translateService = inject(TranslateService);
  private destroy$ = new Subject<void>();

  // State for accessibility testing
  isTestRunning = false;
  testResults: AccessibilityTestResponse | null = null;
  errorMessage = '';
  showVisualPreview = false;
  
  // Computed data for charts (to avoid recalculation on every change detection)
  desktopChartData: { series: number[]; labels: string[]; colors: string[] } | null = null;
  mobileChartData: { series: number[]; labels: string[]; colors: string[] } | null = null;
  desktopMetrics: { totalAutomated: number; failed: number; passed: number; passRate: number; manualChecks: number } | null = null;
  mobileMetrics: { totalAutomated: number; failed: number; passed: number; passRate: number; manualChecks: number } | null = null;

  // Mapping of API titles to translation keys for manual verification items
  private manualVerificationMapping: { [key: string]: string } = {
    'Interactive controls are keyboard focusable': 'accessibility-manual-interactive-control',
    'Interactive elements indicate their purpose and state': 'accessibility-manual-interactive-elements',
    'The page has a logical tab order': 'accessibility-manual-logical-tab',
    'Visual order on the page follows DOM order': 'accessibility-manual-dom-order',
    'User focus is not accidentally trapped in a region': 'accessibility-manual-focus-trap',
    'The user\'s focus is directed to new content added to the page': 'accessibility-manual-new-content',
    'HTML5 landmark elements are used to improve navigation': 'accessibility-manual-html5-landmark',
    'Offscreen content is hidden from assistive technology': 'accessibility-manual-offscreen-content',
    'Custom controls have associated labels': 'accessibility-manual-custom-control',
    'Custom controls have ARIA roles': 'accessibility-manual-aria-roles'
  };

  ngOnInit() {
    // If we have a URL on init, check cache or run test
    if (this.url) {
      this.handleUrlChange(this.url);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // Handle URL changes
    if (changes['url'] && !changes['url'].firstChange && changes['url'].currentValue) {
      this.handleUrlChange(changes['url'].currentValue);
    }

    // Handle language changes
    if (changes['language'] && !changes['language'].firstChange && this.url) {
      this.updateResultsForCurrentLanguage(this.url);
    }
  }

  ngAfterViewInit() {
    // Component view has been initialized
    // ViewChild references are now available
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private handleUrlChange(url: string) {
    // Check if we have cached results for this URL
    const cachedData = accessibilityCache.get(url);
    const langKey = this.language === 'fr-CA' ? 'fr' : 'en';
    
    if (cachedData && cachedData[langKey]) {
      // Use cached results for the current language
      this.testResults = cachedData[langKey];
      this.errorMessage = '';
      // Re-compute chart data and metrics from cached results
      if (cachedData[langKey].data?.desktop?.audits) {
        this.desktopChartData = this.getAuditDistributionData(cachedData[langKey].data.desktop.audits);
        this.desktopMetrics = this.getAutomatedTestMetrics(cachedData[langKey].data.desktop.audits);
      }
      if (cachedData[langKey].data?.mobile?.audits) {
        this.mobileChartData = this.getAuditDistributionData(cachedData[langKey].data.mobile.audits);
        this.mobileMetrics = this.getAutomatedTestMetrics(cachedData[langKey].data.mobile.audits);
      }
      this.cdr.detectChanges();
    } else {
      // New URL or no cache, run the test
      this.runAccessibilityTest();
    }
  }

  private updateResultsForCurrentLanguage(url: string) {
    const cachedData = accessibilityCache.get(url);
    const langKey = this.language === 'fr-CA' ? 'fr' : 'en';
    
    if (cachedData && cachedData[langKey]) {
      // Update to show results in the new language
      this.testResults = cachedData[langKey];
      this.errorMessage = '';
      
      // Re-compute chart data and metrics for the new language
      if (cachedData[langKey].data?.desktop?.audits) {
        this.desktopChartData = this.getAuditDistributionData(cachedData[langKey].data.desktop.audits);
        this.desktopMetrics = this.getAutomatedTestMetrics(cachedData[langKey].data.desktop.audits);
      }
      if (cachedData[langKey].data?.mobile?.audits) {
        this.mobileChartData = this.getAuditDistributionData(cachedData[langKey].data.mobile.audits);
        this.mobileMetrics = this.getAutomatedTestMetrics(cachedData[langKey].data.mobile.audits);
      }
      this.cdr.detectChanges();
    }
  }

  // Helper function to categorize audits by type
  getCategorizedAudits(audits: AccessibilityAudit[]) {
    // Process manual verification items to use translated titles/descriptions
    const processedAudits = audits.map(audit => {
      if (audit.category === 'manual_check') {
        const translationKey = this.manualVerificationMapping[audit.title];
        if (translationKey) {
          return {
            ...audit,
            title: this.translateService.instant(translationKey),
            description: this.translateService.instant(`${translationKey}-description`)
          };
        }
      }
      return audit;
    });

    return {
      failed: processedAudits.filter(audit => audit.category === 'failed'),
      passed: processedAudits.filter(audit => audit.category === 'passed'),
      manual: processedAudits.filter(audit => audit.category === 'manual_check'),
      notApplicable: processedAudits.filter(audit => audit.category === 'not_applicable')
    };
  }

  // Helper function to generate donut chart data
  getAuditDistributionData(audits: AccessibilityAudit[]) {
    const categorized = this.getCategorizedAudits(audits);
    const series = [
      categorized.failed.length,
      categorized.passed.length,
      categorized.manual.length,
      categorized.notApplicable.length
    ];
    
    // Translation keys for chart labels
    const labelKeys = [
      'accessibility-failed-tests',
      'accessibility-passed-tests',
      'accessibility-manual-checks',
      'accessibility-not-applicable'
    ];
    
    // Define colors for each category
    const colors = [
      '#dc3545', // Red for failed tests
      '#28a745', // Green for passed tests
      '#fd7e14', // Orange for manual checks
      '#6c757d'  // Gray for not applicable
    ];
    
    // Only include categories that have values > 0
    const filteredData = series.reduce((acc, value, index) => {
      if (value > 0) {
        acc.series.push(value);
        // Use instant translation for immediate rendering
        acc.labels.push(this.translateService.instant(labelKeys[index]));
        acc.colors.push(colors[index]);
      }
      return acc;
    }, { series: [] as number[], labels: [] as string[], colors: [] as string[] });
    
    // If all values are 0, return at least one item to prevent "no data" message
    if (filteredData.series.length === 0) {
      return {
        series: [1],
        labels: [this.translateService.instant('accessibility-no-data')],
        colors: ['#6c757d'] // Gray for no data
      };
    }
    
    return filteredData;
  }

  // Helper function to calculate automated test metrics
  getAutomatedTestMetrics(audits: AccessibilityAudit[]) {
    const categorized = this.getCategorizedAudits(audits);
    const automatedTestable = categorized.failed.length + categorized.passed.length;
    const passRate = automatedTestable > 0 ? 
      Math.round((categorized.passed.length / automatedTestable) * 100) : 0;
    
    return {
      totalAutomated: automatedTestable,
      failed: categorized.failed.length,
      passed: categorized.passed.length,
      passRate,
      manualChecks: categorized.manual.length
    };
  }

  // TrackBy function for ngFor performance
  trackByAuditId(_index: number, audit: AccessibilityAudit): string {
    return audit.id;
  }

  // Get CSS class for score display
  getScoreClass(score: number): string {
    if (score >= 90) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-danger';
  }

  // Get Deque University URL with language parameter for French
  getDequeUrl(audit: AccessibilityAudit): string {
    const baseUrl = audit.helpUrl || `https://dequeuniversity.com/rules/axe/latest/${audit.id}`;
    // Add language parameter for French users
    if (this.language === 'fr-CA') {
      return baseUrl.includes('?') ? `${baseUrl}&lang=fr` : `${baseUrl}?lang=fr`;
    }
    return baseUrl;
  }

  // Toggle visual preview
  toggleVisualPreview(): void {
    this.showVisualPreview = !this.showVisualPreview;
    
    if (this.showVisualPreview && this.url && this.testResults?.data) {
      // Wait for Angular to render the preview containers before accessing them
      setTimeout(() => {
        // Fetch page HTML and render with accessibility highlights
        this.renderAccessibilityPreview();
      }, 0);
    }
  }

  // Render the page with accessibility highlights
  private renderAccessibilityPreview(): void {
    if (!this.url) return;

    // Show loading state in preview containers
    const loadingHtml = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #666;">
        <div style="text-align: center;">
          <i class="pi pi-spin pi-spinner" style="font-size: 2rem; display: block; margin-bottom: 1rem;"></i>
          <p>${this.translateService.instant('accessibility-loading-preview')}</p>
        </div>
      </div>
    `;

    if (this.desktopPreviewContainer) {
      this.renderPreviewInContainer(this.desktopPreviewContainer.nativeElement, loadingHtml, 'desktop');
    }
    if (this.mobilePreviewContainer) {
      this.renderPreviewInContainer(this.mobilePreviewContainer.nativeElement, loadingHtml, 'mobile');
    }

    // Fetch the page HTML
    this.apiService
      .get<{ html: string; url?: string }>(`/api/pages/html?url=${encodeURIComponent(this.url)}`)
      .pipe(
        catchError((error) => {
          console.error('Failed to fetch page HTML:', error);
          const errorHtml = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #dc3545;">
              <div style="text-align: center;">
                <i class="pi pi-exclamation-triangle" style="font-size: 2rem; display: block; margin-bottom: 1rem;"></i>
                <p>${this.translateService.instant('accessibility-preview-error')}</p>
              </div>
            </div>
          `;
          if (this.desktopPreviewContainer) {
            this.renderPreviewInContainer(this.desktopPreviewContainer.nativeElement, errorHtml, 'desktop');
          }
          if (this.mobilePreviewContainer) {
            this.renderPreviewInContainer(this.mobilePreviewContainer.nativeElement, errorHtml, 'mobile');
          }
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        if (response && response.html) {
          console.log('Received HTML response, length:', response.html.length);
          
          // Render the HTML with accessibility highlights
          if (this.desktopPreviewContainer && this.testResults?.data?.desktop) {
            console.log('Rendering desktop preview');
            this.renderAccessibilityHighlights(
              this.desktopPreviewContainer.nativeElement,
              response.html,
              this.testResults.data.desktop.audits,
              'desktop'
            );
          }
          if (this.mobilePreviewContainer && this.testResults?.data?.mobile) {
            console.log('Rendering mobile preview');
            this.renderAccessibilityHighlights(
              this.mobilePreviewContainer.nativeElement,
              response.html,
              this.testResults.data.mobile.audits,
              'mobile'
            );
          }
        } else {
          console.error('No HTML in response:', response);
        }
      });
  }

  // Create or update preview container with Shadow DOM
  private renderPreviewInContainer(container: HTMLElement, content: string, _strategy: 'desktop' | 'mobile'): void {
    // Clear container
    container.innerHTML = '';
    
    // Create custom element for Shadow DOM
    let element = container.querySelector('accessibility-preview') as HTMLElement;
    if (!element) {
      element = document.createElement('accessibility-preview');
      container.appendChild(element);
    }

    // Create or get Shadow DOM
    const shadowDOM = element.shadowRoot || element.attachShadow({ mode: 'open' });
    shadowDOM.innerHTML = content;
  }

  // Render page HTML with accessibility highlights
  private renderAccessibilityHighlights(
    container: HTMLElement,
    html: string,
    audits: AccessibilityAudit[],
    strategy: 'desktop' | 'mobile'
  ): void {
    // Get failed audits with selectors
    const failedAudits = audits.filter(audit => audit.category === 'failed' && audit.selector);
    
    // Create custom element for Shadow DOM
    let element = container.querySelector('accessibility-preview') as HTMLElement;
    if (!element) {
      element = document.createElement('accessibility-preview');
      container.appendChild(element);
    }

    // Create or get Shadow DOM
    const shadowDOM = element.shadowRoot || element.attachShadow({ mode: 'open' });

    // Parse the HTML and fix relative URLs
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract base URL from the page URL
    if (!this.url) {
      console.error('No URL available for preview');
      return;
    }
    
    let origin: string;
    try {
      const baseUrl = new URL(this.url);
      origin = baseUrl.origin;
    } catch (error) {
      console.error('Invalid URL format:', this.url, error);
      // Try to construct a valid URL
      try {
        const baseUrl = new URL(`https://${this.url}`);
        origin = baseUrl.origin;
      } catch (e) {
        console.error('Unable to parse URL:', this.url);
        return;
      }
    }
    
    // Fix all relative URLs in the document
    this.fixRelativeUrls(doc, origin);
    
    // Add viewport meta for mobile view
    if (strategy === 'mobile') {
      const viewport = doc.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1';
      doc.head.appendChild(viewport);
    }

    // Remove external stylesheets that might cause CORS issues
    const externalStyles = doc.querySelectorAll('link[rel="stylesheet"][href*="://"]');
    externalStyles.forEach(link => link.remove());

    shadowDOM.innerHTML = `
      <style>
        /* Basic reset and layout styles */
        * {
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          line-height: 1.5;
          color: #333;
          background: #fff;
          margin: 0;
          padding: 20px;
        }
        
        img {
          max-width: 100%;
          height: auto;
        }
        
        /* Accessibility highlight styles */
        .accessibility-failed {
          outline: 3px solid #dc3545 !important;
          outline-offset: 2px;
          position: relative;
          background-color: rgba(220, 53, 69, 0.1);
        }
        
        .accessibility-failed::after {
          content: attr(data-accessibility-issue);
          position: absolute;
          top: -25px;
          left: 0;
          background: #dc3545;
          color: white;
          padding: 2px 8px;
          font-size: 12px;
          border-radius: 3px;
          white-space: nowrap;
          z-index: 1000;
          pointer-events: none;
          display: none;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .accessibility-failed:hover::after {
          display: block;
        }
        
        /* Mobile viewport simulation */
        ${strategy === 'mobile' ? `
          body {
            max-width: 375px;
            margin: 0 auto;
            transform-origin: top left;
            transform: scale(0.8);
          }
        ` : ''}
        
        /* Basic link styles */
        a {
          color: #0066cc;
          text-decoration: underline;
        }
        
        a:hover {
          color: #0052a3;
        }
      </style>
      ${doc.documentElement.outerHTML}
    `;

    // Apply highlights to failed elements
    setTimeout(() => {
      failedAudits.forEach(audit => {
        if (audit.selector) {
          try {
            const elements = shadowDOM.querySelectorAll(audit.selector);
            elements.forEach(el => {
              el.classList.add('accessibility-failed');
              el.setAttribute('data-accessibility-issue', audit.title);
            });
          } catch (error) {
            console.warn(`Invalid selector for audit ${audit.id}:`, audit.selector, error);
          }
        }
      });
    }, 100);
  }

  // Fix relative URLs in the document to absolute URLs
  private fixRelativeUrls(doc: Document, origin: string): void {
    // Fix image sources (including SVG)
    const images = doc.querySelectorAll('img[src], image[href], image[xlink\\:href]');
    images.forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('href') || img.getAttribute('xlink:href');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        const absoluteUrl = new URL(src, origin).href;
        if (img.hasAttribute('src')) {
          img.setAttribute('src', absoluteUrl);
        }
        if (img.hasAttribute('href')) {
          img.setAttribute('href', absoluteUrl);
        }
        if (img.hasAttribute('xlink:href')) {
          img.setAttribute('xlink:href', absoluteUrl);
        }
      }
    });

    // Fix SVG use elements
    const useElements = doc.querySelectorAll('use[href], use[xlink\\:href]');
    useElements.forEach(use => {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href');
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        const absoluteUrl = new URL(href, origin).href;
        if (use.hasAttribute('href')) {
          use.setAttribute('href', absoluteUrl);
        }
        if (use.hasAttribute('xlink:href')) {
          use.setAttribute('xlink:href', absoluteUrl);
        }
      }
    });

    // Fix link hrefs
    const links = doc.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        link.setAttribute('href', new URL(href, origin).href);
      }
    });

    // Fix form actions
    const forms = doc.querySelectorAll('form[action]');
    forms.forEach(form => {
      const action = form.getAttribute('action');
      if (action && !action.startsWith('http')) {
        form.setAttribute('action', new URL(action, origin).href);
      }
    });

    // Fix source elements
    const sources = doc.querySelectorAll('source[src], source[srcset]');
    sources.forEach(source => {
      const src = source.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        source.setAttribute('src', new URL(src, origin).href);
      }
      
      const srcset = source.getAttribute('srcset');
      if (srcset) {
        const fixedSrcset = srcset.split(',').map(src => {
          const [url, descriptor] = src.trim().split(' ');
          if (url && !url.startsWith('http') && !url.startsWith('data:')) {
            return `${new URL(url, origin).href} ${descriptor || ''}`.trim();
          }
          return src.trim();
        }).join(', ');
        source.setAttribute('srcset', fixedSrcset);
      }
    });

    // Fix background images in inline styles
    const elementsWithStyle = doc.querySelectorAll('[style*="url("]');
    elementsWithStyle.forEach(el => {
      const style = el.getAttribute('style');
      if (style) {
        const fixedStyle = style.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, url) => {
          if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('#')) {
            try {
              return `url('${new URL(url, origin).href}')`;
            } catch (e) {
              // If URL construction fails, return original
              return match;
            }
          }
          return match;
        });
        el.setAttribute('style', fixedStyle);
      }
    });
    
    // Fix object data
    const objects = doc.querySelectorAll('object[data]');
    objects.forEach(obj => {
      const data = obj.getAttribute('data');
      if (data && !data.startsWith('http') && !data.startsWith('data:')) {
        obj.setAttribute('data', new URL(data, origin).href);
      }
    });
    
    // Fix embed src
    const embeds = doc.querySelectorAll('embed[src]');
    embeds.forEach(embed => {
      const src = embed.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        embed.setAttribute('src', new URL(src, origin).href);
      }
    });
  }

  // Parse markdown-style links in description text
  parseMarkdownLinks(description: string): SafeHtml {
    // Regular expression to match markdown links: [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    
    // Get current language
    const isEnglish = this.language === 'en-CA';
    
    // Replace markdown links with HTML anchor tags
    const htmlDescription = description.replace(markdownLinkRegex, (_match, linkText, url) => {
      // Add ?hl=fr to Chrome developer documentation URLs if user is on French page
      let processedUrl = url;
      if (!isEnglish && url.includes('https://developer.chrome.com/docs/lighthouse/accessibility')) {
        // Check if URL already has query parameters
        processedUrl = url.includes('?') ? `${url}&hl=fr` : `${url}?hl=fr`;
      }
      
      return `<a href="${processedUrl}" target="_blank" rel="noopener noreferrer" class="text-primary">${linkText}</a>`;
    });
    
    // Sanitize the HTML to prevent XSS attacks while allowing safe anchor tags
    return this.sanitizer.sanitize(1, htmlDescription) || description;
  }

  // Run accessibility test
  runAccessibilityTest() {
    if (!this.url) {
      this.errorMessage = 'No URL available for testing';
      return;
    }

    this.isTestRunning = true;
    this.errorMessage = '';
    this.testResults = null;

    // API will fetch both English and French results
    this.apiService
      .get<LocalizedAccessibilityTestResponse>(`/api/pages/accessibility-test?url=${encodeURIComponent(this.url)}`)
      .pipe(
        catchError((error) => {
          console.error('Accessibility test error:', error);
          const errorResponse = {
            success: false,
            error: error.message || 'Failed to run accessibility test'
          } as AccessibilityTestResponse;
          return of({
            en: errorResponse,
            fr: errorResponse
          } as LocalizedAccessibilityTestResponse);
        }),
        finalize(() => {
          this.isTestRunning = false;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        const langKey = this.language === 'fr-CA' ? 'fr' : 'en';
        
        if (response && response[langKey] && response[langKey].success) {
          // Cache both language results
          if (this.url) {
            accessibilityCache.set(this.url, response);
          }
          
          // Use the current language results
          this.testResults = response[langKey];
          
          // Pre-compute chart data and metrics to avoid recalculation on every change detection
          if (response[langKey].data?.desktop?.audits) {
            this.desktopChartData = this.getAuditDistributionData(response[langKey].data.desktop.audits);
            this.desktopMetrics = this.getAutomatedTestMetrics(response[langKey].data.desktop.audits);
          }
          if (response[langKey].data?.mobile?.audits) {
            this.mobileChartData = this.getAuditDistributionData(response[langKey].data.mobile.audits);
            this.mobileMetrics = this.getAutomatedTestMetrics(response[langKey].data.mobile.audits);
          }
          // Manually trigger change detection to ensure charts are updated
          this.cdr.detectChanges();
        } else {
          const errorResponse = response && response[langKey];
          this.errorMessage = (errorResponse && errorResponse.error) || 'An error occurred during testing';
          this.desktopChartData = null;
          this.mobileChartData = null;
          this.desktopMetrics = null;
          this.mobileMetrics = null;
        }
      });
  }
}
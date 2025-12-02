import { Injectable } from '@angular/core';
<<<<<<< HEAD

interface AccessibilityTestResponse {
  success: boolean;
  data?: any;
  error?: string;
}
=======
import type { AccessibilityTestResponse } from '@dua-upd/types-common';
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f

@Injectable({
  providedIn: 'root'
})
export class PageTestsCacheService {
  private accessibilityCache = new Map<string, AccessibilityTestResponse>();

  // Accessibility cache methods
  getAccessibilityCache(url: string): AccessibilityTestResponse | undefined {
    return this.accessibilityCache.get(url);
  }

  setAccessibilityCache(url: string, data: AccessibilityTestResponse): void {
    this.accessibilityCache.set(url, data);
  }

  clearAccessibilityCache(): void {
    this.accessibilityCache.clear();
  }

  // Clear all caches
  clearAllCaches(): void {
    this.accessibilityCache.clear();
  }
}
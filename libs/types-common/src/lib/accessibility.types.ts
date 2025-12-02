<<<<<<< HEAD
export interface LocalizedAccessibilityTestResponse {
  en?: AccessibilityTestResponse;
  fr?: AccessibilityTestResponse;
}

export interface AccessibilityTestResponse {
=======
export type LocalizedAccessibilityTestResponse = {
  en?: AccessibilityTestResponse;
  fr?: AccessibilityTestResponse;
};

export type AccessibilityTestResponse = {
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f
  success: boolean;
  data?: {
    desktop: AccessibilityTestResult;
  };
  error?: string;
<<<<<<< HEAD
}

export interface AccessibilityTestResult {
=======
};

export type AccessibilityTestResult = {
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f
  url: string;
  strategy: 'mobile' | 'desktop';
  score: number;
  scoreDisplay: string;
  audits: AccessibilityAudit[];
  testedAt: Date;
<<<<<<< HEAD
}

export interface AccessibilityAudit {
=======
};

export type AccessibilityAudit = {
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f
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
<<<<<<< HEAD
}
=======
};
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f

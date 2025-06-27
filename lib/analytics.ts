'use client';

declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event',
      targetId: string,
      config?: {
        page_path?: string;
        event_category?: string;
        event_label?: string;
        value?: number;
        user_id?: string;
        session_id?: string;
        chat_id?: string;
        file_size?: number;
      },
    ) => void;
    dataLayer: unknown[];
  }
}

// Analytics helper functions
export function pageview(url: string, userId?: string) {
  if (
    typeof window !== 'undefined' &&
    window.gtag &&
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  ) {
    window.gtag('config', process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID, {
      page_path: url,
      user_id: userId,
    });
  }
}

export function trackChatMessage(data: {
  chatId: string;
  messageType: 'user' | 'assistant';
  hasAttachments: boolean;
  userId?: string;
}) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'chat_message', {
      event_category: 'chat',
      event_label: data.messageType,
      value: data.hasAttachments ? 1 : 0,
      user_id: data.userId,
      chat_id: data.chatId,
    });
  }
}

export function trackFileUpload(data: {
  fileType: string;
  fileSize: number;
  success: boolean;
  userId?: string;
}) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'file_upload', {
      event_category: 'engagement',
      event_label: data.fileType,
      value: data.success ? 1 : 0,
      user_id: data.userId,
      file_size: data.fileSize,
    });
  }
}

export function trackArtifactAction(data: {
  artifactType: string;
  action: string;
  userId?: string;
}) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'artifact_action', {
      event_category: 'artifact',
      event_label: `${data.artifactType}_${data.action}`,
      user_id: data.userId,
    });
  }
}

export function trackAuthentication(data: {
  method: 'login' | 'register';
  success: boolean;
  provider?: string;
}) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', data.method, {
      event_category: 'authentication',
      event_label: data.provider || 'email',
      value: data.success ? 1 : 0,
    });
  }
}

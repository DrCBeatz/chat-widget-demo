// src/custom-elements.d.ts
export {};
import type * as React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'aqila-chat': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>, HTMLElement
      > & {
        tenant?: string;
        'cdn-base'?: string;
        'config-version'?: string;
        floating?: '' | 'true' | 'false';
      };
    }
  }
}
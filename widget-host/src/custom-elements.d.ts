// src/custom-elements.d.ts
import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'aqila-chat': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        tenant?: string;
        floating?: '' | undefined;
        'cdn-base'?: string;
        'config-version'?: string;
      };
    }
  }
}
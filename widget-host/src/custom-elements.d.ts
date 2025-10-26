// src/custom-elements.d.ts
export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'aqila-chat': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>, HTMLElement
      > & {
          tenant?: string;
          'cdn-base'?: string;
        'config-version'?: string;
      };
    }
  }
}
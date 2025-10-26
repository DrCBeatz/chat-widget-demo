// src/ChatWidget.tsx
import { useEffect, useRef, memo } from 'react';

const ChatWidget = memo(function ChatWidget({
  tenant,
  cdnBase,
  configVersion,
}: {
  tenant: string;
  cdnBase?: string;
  configVersion?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current!;
    // Set attributes explicitly (attributes, not props)
    el.setAttribute('tenant', tenant);
    if (cdnBase) el.setAttribute('cdn-base', cdnBase);
    else el.removeAttribute('cdn-base');
    if (configVersion) el.setAttribute('config-version', configVersion);
    else el.removeAttribute('config-version');
  }, [tenant, cdnBase, configVersion]);

  // Important: return the element WITHOUT passing attributes via JSX
  return <aqila-chat ref={ref} />;
});

export default ChatWidget;
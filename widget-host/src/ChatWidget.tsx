// src/ChatWidget.tsx
import { useEffect, useRef, memo } from 'react';

type Props = {
  tenant: string;
  floating?: boolean;
  cdnBase?: string;
  configVersion?: string;
};

const ChatWidget = memo(function ChatWidget({
  tenant,
  floating = false,
  cdnBase,
  configVersion,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current!;
    el.setAttribute('tenant', tenant);

    if (floating) el.setAttribute('floating', '');
    else el.removeAttribute('floating');

    if (cdnBase) el.setAttribute('cdn-base', cdnBase);
    else el.removeAttribute('cdn-base');

    if (configVersion) el.setAttribute('config-version', configVersion);
    else el.removeAttribute('config-version');
  }, [tenant, floating, cdnBase, configVersion]);

  return <aqila-chat ref={ref} />;
});

export default ChatWidget;
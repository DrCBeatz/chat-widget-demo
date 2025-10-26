// widget-host/src/App.tsx

import ChatWidget from './ChatWidget';

export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <h1>React host embedding &lt;aqila-chat&gt;</h1>
      <ChatWidget tenant="hospital-a" floating />
    </div>
  );
}
/**
 * UI Resources for MCP Apps Testbed
 *
 * Elegant, responsive widgets that adapt to available space:
 *
 * - Collapsed (< 450px): Horizontal/compact layout
 * - Expanded (>= 450px): Vertical/spacious layout
 * - View (>= 750px): Full experience with all details
 *
 * Design follows Mesh's aesthetic: clean, minimal, subtle.
 */

export const resources = [
  // Core widgets
  {
    uri: "ui://counter-app",
    name: "Counter",
    description: "Interactive counter with increment/decrement controls",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: "ui://metric",
    name: "Metric Display",
    description: "Display a key metric with label and optional trend",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: "ui://progress",
    name: "Progress Tracker",
    description: "Visual progress bar with percentage and label",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: "ui://greeting-app",
    name: "Greeting Card",
    description: "Animated personalized greeting",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: "ui://chart-app",
    name: "Bar Chart",
    description: "Animated bar chart visualization",
    mimeType: "text/html;profile=mcp-app",
  },
  // New widgets
  {
    uri: "ui://timer",
    name: "Timer",
    description: "Countdown timer with start/pause controls",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: "ui://status",
    name: "Status Badge",
    description: "Status indicator with icon and label",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: "ui://quote",
    name: "Quote",
    description: "Display a quote or text with attribution",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: "ui://sparkline",
    name: "Sparkline",
    description: "Compact inline trend chart",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: "ui://code",
    name: "Code Snippet",
    description: "Syntax-highlighted code display",
    mimeType: "text/html;profile=mcp-app",
  },
];

// Design tokens matching Mesh's aesthetic
const tokens = {
  bg: "#ffffff",
  bgSubtle: "#f9fafb",
  border: "#e5e7eb",
  borderSubtle: "rgba(0,0,0,0.06)",
  text: "#111827",
  textMuted: "#6b7280",
  textSubtle: "#9ca3af",
  primary: "#6366f1", // indigo-500
  primaryLight: "#eef2ff", // indigo-50
  success: "#10b981", // emerald-500
  successLight: "#ecfdf5",
  destructive: "#ef4444",
  destructiveLight: "#fef2f2",
};

const apps: Record<string, string> = {
  // ============================================================================
  // Counter Widget
  // Collapsed: Horizontal - value on left, controls on right
  // Expanded: Vertical - centered with larger controls
  // ============================================================================
  "ui://counter-app": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }

    /* Collapsed: Horizontal layout */
    .container {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      gap: 16px;
    }
    .value-section {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .value {
      font-size: 36px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: ${tokens.text};
    }
    .label {
      font-size: 13px;
      color: ${tokens.textMuted};
    }
    .controls {
      display: flex;
      gap: 8px;
    }
    button {
      width: 36px;
      height: 36px;
      border: 1px solid ${tokens.border};
      border-radius: 8px;
      background: ${tokens.bg};
      font-size: 18px;
      color: ${tokens.textMuted};
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    button:hover {
      background: ${tokens.bgSubtle};
      border-color: ${tokens.textMuted};
      color: ${tokens.text};
    }
    button:active { transform: scale(0.95); }
    .info { display: none; }

    /* Expanded: Vertical layout */
    @media (min-height: 450px) {
      .container {
        flex-direction: column;
        justify-content: center;
        padding: 32px;
        gap: 24px;
      }
      .value-section {
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .value { font-size: 64px; }
      .label { font-size: 14px; order: -1; }
      .controls { gap: 12px; }
      button {
        width: 48px;
        height: 48px;
        font-size: 22px;
        border-radius: 12px;
      }
      .info {
        display: block;
        font-size: 12px;
        color: ${tokens.textSubtle};
        text-align: center;
      }
    }

    /* View: Larger with more context */
    @media (min-height: 750px) {
      .container { padding: 48px; gap: 32px; }
      .value { font-size: 80px; }
      .label { font-size: 15px; }
      button {
        width: 56px;
        height: 56px;
        font-size: 26px;
      }
      .info { font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="value-section">
      <span class="value" id="value">0</span>
      <span class="label">Counter</span>
    </div>
    <div class="controls">
      <button onclick="update(-1)">−</button>
      <button onclick="update(1)">+</button>
    </div>
    <div class="info" id="info">Click buttons to adjust</div>
  </div>
  <script>
    let count = 0;
    function update(delta) {
      count += delta;
      document.getElementById('value').textContent = count;
    }
    window.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.initialValue !== undefined) {
          count = input.initialValue;
          document.getElementById('value').textContent = count;
        }
        if (input.label) {
          document.querySelector('.label').textContent = input.label;
        }
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,

  // ============================================================================
  // Metric Widget
  // Collapsed: Horizontal - metric value prominent, label beside
  // Expanded: Vertical - centered with trend indicator
  // ============================================================================
  "ui://metric": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }

    /* Collapsed: Horizontal */
    .container {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      gap: 16px;
    }
    .main {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .value {
      font-size: 32px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .unit {
      font-size: 14px;
      color: ${tokens.textMuted};
    }
    .label {
      font-size: 13px;
      color: ${tokens.textMuted};
    }
    .trend {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      font-weight: 500;
    }
    .trend.up { color: ${tokens.success}; }
    .trend.down { color: ${tokens.destructive}; }
    .trend-icon { font-size: 11px; }
    .description { display: none; }

    /* Expanded: Vertical */
    @media (min-height: 450px) {
      .container {
        flex-direction: column;
        justify-content: center;
        padding: 32px;
        gap: 16px;
      }
      .main {
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .value { font-size: 56px; }
      .unit { font-size: 16px; }
      .label { font-size: 14px; order: -1; }
      .trend { font-size: 14px; }
      .description {
        display: block;
        font-size: 13px;
        color: ${tokens.textSubtle};
        text-align: center;
        max-width: 280px;
      }
    }

    /* View: Full details */
    @media (min-height: 750px) {
      .container { padding: 48px; gap: 20px; }
      .value { font-size: 72px; }
      .unit { font-size: 18px; }
      .label { font-size: 15px; }
      .trend { font-size: 15px; }
      .description { font-size: 14px; max-width: 320px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="main">
      <span class="label" id="label">Metric</span>
      <span class="value" id="value">—</span>
      <span class="unit" id="unit"></span>
    </div>
    <div class="trend up" id="trend">
      <span class="trend-icon">↑</span>
      <span id="trend-value">12%</span>
    </div>
    <div class="description" id="description">Compared to previous period</div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        const result = msg.params?.toolResult;
        
        // From tool input
        if (input.label) document.getElementById('label').textContent = input.label;
        if (input.value !== undefined) document.getElementById('value').textContent = input.value;
        if (input.unit) document.getElementById('unit').textContent = input.unit;
        if (input.trend !== undefined) {
          const trendEl = document.getElementById('trend');
          const isUp = input.trend >= 0;
          trendEl.className = 'trend ' + (isUp ? 'up' : 'down');
          trendEl.querySelector('.trend-icon').textContent = isUp ? '↑' : '↓';
          document.getElementById('trend-value').textContent = Math.abs(input.trend) + '%';
        }
        if (input.description) document.getElementById('description').textContent = input.description;
        
        // From tool result
        if (result?.content?.[0]?.text) {
          try {
            const data = JSON.parse(result.content[0].text);
            if (data.value !== undefined) document.getElementById('value').textContent = data.value;
            if (data.trend !== undefined) {
              const trendEl = document.getElementById('trend');
              const isUp = data.trend >= 0;
              trendEl.className = 'trend ' + (isUp ? 'up' : 'down');
              trendEl.querySelector('.trend-icon').textContent = isUp ? '↑' : '↓';
              document.getElementById('trend-value').textContent = Math.abs(data.trend) + '%';
            }
          } catch {}
        }
        
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,

  // ============================================================================
  // Progress Widget
  // Collapsed: Horizontal bar with percentage
  // Expanded: Vertical with label, bar, and details
  // ============================================================================
  "ui://progress": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }

    /* Collapsed: Compact horizontal */
    .container {
      height: 100%;
      display: flex;
      align-items: center;
      padding: 16px 20px;
      gap: 16px;
    }
    .info {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-shrink: 0;
    }
    .percentage {
      font-size: 24px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .label {
      font-size: 13px;
      color: ${tokens.textMuted};
    }
    .bar-container {
      flex: 1;
      height: 8px;
      background: ${tokens.bgSubtle};
      border-radius: 4px;
      overflow: hidden;
    }
    .bar {
      height: 100%;
      background: ${tokens.primary};
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .details { display: none; }

    /* Expanded: Vertical layout */
    @media (min-height: 450px) {
      .container {
        flex-direction: column;
        justify-content: center;
        padding: 32px;
        gap: 20px;
      }
      .info {
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .percentage { font-size: 48px; }
      .label { font-size: 14px; order: -1; }
      .bar-container {
        width: 100%;
        max-width: 280px;
        height: 12px;
        border-radius: 6px;
      }
      .bar { border-radius: 6px; }
      .details {
        display: block;
        font-size: 13px;
        color: ${tokens.textSubtle};
        text-align: center;
      }
    }

    /* View: Full experience */
    @media (min-height: 750px) {
      .container { padding: 48px; gap: 24px; }
      .percentage { font-size: 64px; }
      .label { font-size: 15px; }
      .bar-container {
        max-width: 360px;
        height: 16px;
        border-radius: 8px;
      }
      .bar { border-radius: 8px; }
      .details { font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="info">
      <span class="label" id="label">Progress</span>
      <span class="percentage" id="percentage">0%</span>
    </div>
    <div class="bar-container">
      <div class="bar" id="bar" style="width: 0%"></div>
    </div>
    <div class="details" id="details">0 of 100 completed</div>
  </div>
  <script>
    function setProgress(value, total = 100) {
      const pct = Math.round((value / total) * 100);
      document.getElementById('percentage').textContent = pct + '%';
      document.getElementById('bar').style.width = pct + '%';
      document.getElementById('details').textContent = value + ' of ' + total + ' completed';
    }
    
    window.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        
        if (input.label) document.getElementById('label').textContent = input.label;
        if (input.value !== undefined) {
          setProgress(input.value, input.total || 100);
        }
        
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
    
    // Demo animation
    let demo = 0;
    setInterval(() => {
      demo = (demo + 1) % 101;
      setProgress(demo);
    }, 100);
  </script>
</body>
</html>`,

  // ============================================================================
  // ADDITIONAL WIDGETS
  // ============================================================================

  // Greeting App
  "ui://greeting-app": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }
    .container {
      height: 100%;
      display: flex;
      align-items: center;
      padding: 16px 20px;
      gap: 16px;
    }
    .emoji {
      font-size: 32px;
      animation: wave 1.5s ease-in-out infinite;
      flex-shrink: 0;
    }
    @keyframes wave {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(20deg); }
      75% { transform: rotate(-10deg); }
    }
    .content { flex: 1; min-width: 0; }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: ${tokens.primary};
      margin-bottom: 2px;
    }
    .message {
      font-size: 13px;
      color: ${tokens.textMuted};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .details { display: none; }

    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; padding: 32px; gap: 16px; text-align: center; }
      .emoji { font-size: 56px; }
      .greeting { font-size: 28px; margin-bottom: 8px; }
      .message { font-size: 15px; white-space: normal; }
      .details { display: block; margin-top: 16px; padding: 12px 16px; background: ${tokens.bgSubtle}; border-radius: 8px; font-size: 12px; color: ${tokens.textMuted}; }
    }
    @media (min-height: 750px) {
      .container { padding: 48px; gap: 20px; }
      .emoji { font-size: 72px; }
      .greeting { font-size: 36px; }
      .message { font-size: 17px; }
      .details { font-size: 13px; padding: 16px 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="emoji">👋</div>
    <div class="content">
      <div class="greeting" id="greeting">Hello!</div>
      <div class="message" id="message">Welcome to MCP Apps</div>
    </div>
    <div class="details" id="details">Interactive greeting card</div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.method === 'ui/initialize') {
        const input = m.params?.toolInput || {};
        const result = m.params?.toolResult || {};
        if (input.name) document.getElementById('greeting').textContent = 'Hello, ' + input.name + '!';
        if (input.message) document.getElementById('message').textContent = input.message;
        if (result.content?.[0]?.text) {
          document.getElementById('message').textContent = result.content[0].text;
          document.getElementById('details').textContent = result.content[0].text;
        }
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,

  // Chart App (original)
  "ui://chart-app": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
      padding: 12px;
    }
    .container {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    h2 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      flex-shrink: 0;
    }
    .chart-container { flex: 1; min-height: 0; }
    .chart {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      height: 100%;
      border-bottom: 1px solid ${tokens.border};
      padding-bottom: 4px;
    }
    .bar-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      height: 100%;
      justify-content: flex-end;
    }
    .bar {
      width: 100%;
      max-width: 40px;
      background: ${tokens.primary};
      border-radius: 4px 4px 0 0;
      transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .label { font-size: 10px; color: ${tokens.textMuted}; flex-shrink: 0; }
    .value { font-size: 9px; color: ${tokens.textSubtle}; flex-shrink: 0; display: none; }
    .legend { display: none; }

    @media (min-height: 450px) {
      body { padding: 20px; }
      h2 { font-size: 16px; margin-bottom: 16px; }
      .chart { gap: 16px; padding-bottom: 8px; }
      .bar { max-width: 56px; border-radius: 6px 6px 0 0; }
      .label { font-size: 12px; }
      .value { display: block; font-size: 11px; font-weight: 500; }
      .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; padding-top: 12px; border-top: 1px solid ${tokens.border}; }
      .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${tokens.textMuted}; }
      .legend-dot { width: 8px; height: 8px; border-radius: 50%; background: ${tokens.primary}; }
    }
    @media (min-height: 750px) {
      body { padding: 28px; }
      h2 { font-size: 18px; margin-bottom: 24px; }
      .chart { gap: 20px; }
      .bar { max-width: 72px; }
      .label { font-size: 13px; }
      .value { font-size: 12px; }
      .legend { gap: 16px; margin-top: 20px; }
      .legend-item { font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h2 id="title">Favorite Fruits Survey</h2>
    <div class="chart-container">
      <div class="chart" id="chart"></div>
    </div>
    <div class="legend" id="legend"></div>
  </div>
  <script>
    const defaultData = [
      { label: 'Apples', value: 45 },
      { label: 'Bananas', value: 30 },
      { label: 'Oranges', value: 60 },
      { label: 'Grapes', value: 25 },
      { label: 'Mangoes', value: 55 }
    ];
    function render(data) {
      const chart = document.getElementById('chart');
      const legend = document.getElementById('legend');
      chart.innerHTML = ''; legend.innerHTML = '';
      if (!data?.length) { chart.innerHTML = '<div style="color:#9ca3af;width:100%;text-align:center;align-self:center">No data</div>'; return; }
      const max = Math.max(...data.map(d => d.value));
      data.forEach((d, i) => {
        const wrap = document.createElement('div'); wrap.className = 'bar-wrap';
        const value = document.createElement('div'); value.className = 'value'; value.textContent = d.value;
        const bar = document.createElement('div'); bar.className = 'bar'; bar.style.height = '0';
        setTimeout(() => { bar.style.height = (d.value / max * 100) + '%'; }, i * 60);
        const label = document.createElement('div'); label.className = 'label'; label.textContent = d.label;
        wrap.append(value, bar, label); chart.appendChild(wrap);
        const legendItem = document.createElement('div'); legendItem.className = 'legend-item';
        legendItem.innerHTML = '<div class="legend-dot"></div>' + d.label + ': ' + d.value;
        legend.appendChild(legendItem);
      });
    }
    window.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.method === 'ui/initialize') {
        const input = m.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        render(input.data || defaultData);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }), '*');
      }
    });
    render(defaultData);
  </script>
</body>
</html>`,

  // ============================================================================
  // Timer Widget
  // ============================================================================
  "ui://timer": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }
    .container {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      gap: 16px;
    }
    .time {
      font-size: 32px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, monospace;
    }
    .label { font-size: 13px; color: ${tokens.textMuted}; display: none; }
    .controls { display: flex; gap: 8px; }
    button {
      padding: 8px 16px;
      border: 1px solid ${tokens.border};
      border-radius: 8px;
      background: ${tokens.bg};
      font-size: 13px;
      color: ${tokens.textMuted};
      cursor: pointer;
      transition: all 0.15s;
    }
    button:hover { background: ${tokens.bgSubtle}; color: ${tokens.text}; }
    button.primary { background: ${tokens.primary}; color: white; border-color: ${tokens.primary}; }
    button.primary:hover { opacity: 0.9; }

    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; padding: 32px; gap: 20px; }
      .time { font-size: 56px; }
      .label { display: block; font-size: 14px; order: -1; }
      .controls { gap: 12px; }
      button { padding: 12px 24px; font-size: 14px; border-radius: 10px; }
    }
    @media (min-height: 750px) {
      .container { padding: 48px; gap: 28px; }
      .time { font-size: 72px; }
      button { padding: 14px 28px; font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <span class="label" id="label">Timer</span>
    <span class="time" id="time">00:00</span>
    <div class="controls">
      <button id="toggle" class="primary" onclick="toggle()">Start</button>
      <button onclick="reset()">Reset</button>
    </div>
  </div>
  <script>
    let seconds = 0, running = false, interval = null;
    function format(s) {
      const m = Math.floor(s / 60), sec = s % 60;
      return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }
    function update() { document.getElementById('time').textContent = format(seconds); }
    function toggle() {
      running = !running;
      document.getElementById('toggle').textContent = running ? 'Pause' : 'Start';
      if (running) interval = setInterval(() => { seconds++; update(); }, 1000);
      else clearInterval(interval);
    }
    function reset() { seconds = 0; update(); }
    window.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.method === 'ui/initialize') {
        const input = m.params?.toolInput || {};
        if (input.seconds) { seconds = input.seconds; update(); }
        if (input.label) document.getElementById('label').textContent = input.label;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,

  // ============================================================================
  // Status Badge Widget
  // ============================================================================
  "ui://status": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }
    .container {
      height: 100%;
      display: flex;
      align-items: center;
      padding: 16px 20px;
      gap: 12px;
    }
    .indicator {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: ${tokens.success};
      flex-shrink: 0;
    }
    .indicator.warning { background: #f59e0b; }
    .indicator.error { background: ${tokens.destructive}; }
    .indicator.info { background: ${tokens.primary}; }
    .content { flex: 1; min-width: 0; }
    .status { font-size: 15px; font-weight: 500; }
    .description { font-size: 12px; color: ${tokens.textMuted}; display: none; }
    .timestamp { font-size: 11px; color: ${tokens.textSubtle}; }

    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; padding: 32px; gap: 16px; text-align: center; }
      .indicator { width: 16px; height: 16px; }
      .status { font-size: 20px; }
      .description { display: block; font-size: 14px; margin-top: 4px; }
      .timestamp { font-size: 13px; margin-top: 8px; }
    }
    @media (min-height: 750px) {
      .container { padding: 48px; gap: 20px; }
      .indicator { width: 20px; height: 20px; }
      .status { font-size: 24px; }
      .description { font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="indicator" id="indicator"></div>
    <div class="content">
      <div class="status" id="status">All Systems Operational</div>
      <div class="description" id="description">No issues detected</div>
    </div>
    <div class="timestamp" id="timestamp">Just now</div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.method === 'ui/initialize') {
        const input = m.params?.toolInput || {};
        if (input.status) document.getElementById('status').textContent = input.status;
        if (input.description) document.getElementById('description').textContent = input.description;
        if (input.type) document.getElementById('indicator').className = 'indicator ' + input.type;
        if (input.timestamp) document.getElementById('timestamp').textContent = input.timestamp;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,

  // ============================================================================
  // Quote Widget
  // ============================================================================
  "ui://quote": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }
    .container {
      height: 100%;
      display: flex;
      align-items: center;
      padding: 16px 20px;
      gap: 12px;
    }
    .quote-mark {
      font-size: 32px;
      color: ${tokens.primary};
      opacity: 0.5;
      line-height: 1;
      flex-shrink: 0;
    }
    .content { flex: 1; min-width: 0; }
    .text {
      font-size: 14px;
      font-style: italic;
      line-height: 1.5;
      color: ${tokens.text};
    }
    .author {
      font-size: 12px;
      color: ${tokens.textMuted};
      margin-top: 4px;
    }
    .author::before { content: '— '; }

    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; padding: 32px; gap: 16px; text-align: center; }
      .quote-mark { font-size: 48px; }
      .text { font-size: 18px; }
      .author { font-size: 14px; margin-top: 12px; }
    }
    @media (min-height: 750px) {
      .container { padding: 48px; gap: 20px; }
      .quote-mark { font-size: 56px; }
      .text { font-size: 22px; max-width: 500px; }
      .author { font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="quote-mark">"</div>
    <div class="content">
      <div class="text" id="text">The best way to predict the future is to invent it.</div>
      <div class="author" id="author">Alan Kay</div>
    </div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.method === 'ui/initialize') {
        const input = m.params?.toolInput || {};
        if (input.text) document.getElementById('text').textContent = input.text;
        if (input.author) document.getElementById('author').textContent = input.author;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,

  // ============================================================================
  // Sparkline Widget
  // ============================================================================
  "ui://sparkline": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }
    .container {
      height: 100%;
      display: flex;
      align-items: center;
      padding: 16px 20px;
      gap: 16px;
    }
    .info { display: flex; align-items: baseline; gap: 8px; flex-shrink: 0; }
    .value { font-size: 24px; font-weight: 600; }
    .label { font-size: 12px; color: ${tokens.textMuted}; }
    .chart { flex: 1; height: 40px; display: flex; align-items: flex-end; gap: 2px; }
    .bar { flex: 1; background: ${tokens.primary}; border-radius: 2px; transition: height 0.3s; }
    .trend { font-size: 12px; color: ${tokens.success}; }
    .trend.down { color: ${tokens.destructive}; }

    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; padding: 32px; gap: 20px; }
      .info { flex-direction: column; align-items: center; gap: 4px; }
      .value { font-size: 36px; }
      .label { font-size: 14px; order: -1; }
      .chart { height: 80px; width: 100%; max-width: 280px; gap: 3px; }
      .bar { border-radius: 3px; }
      .trend { font-size: 14px; }
    }
    @media (min-height: 750px) {
      .container { padding: 48px; gap: 28px; }
      .value { font-size: 48px; }
      .chart { height: 100px; max-width: 360px; gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="info">
      <span class="label" id="label">Requests</span>
      <span class="value" id="value">1,234</span>
    </div>
    <div class="chart" id="chart"></div>
    <span class="trend" id="trend">↑ 12%</span>
  </div>
  <script>
    const defaultData = [30, 45, 28, 60, 55, 70, 65, 80, 75, 90, 85, 95];
    function render(data) {
      const chart = document.getElementById('chart');
      chart.innerHTML = '';
      const max = Math.max(...data);
      data.forEach(v => {
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = (v / max * 100) + '%';
        chart.appendChild(bar);
      });
    }
    window.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.method === 'ui/initialize') {
        const input = m.params?.toolInput || {};
        if (input.label) document.getElementById('label').textContent = input.label;
        if (input.value) document.getElementById('value').textContent = input.value;
        if (input.data) render(input.data);
        if (input.trend !== undefined) {
          const el = document.getElementById('trend');
          const up = input.trend >= 0;
          el.className = 'trend' + (up ? '' : ' down');
          el.textContent = (up ? '↑' : '↓') + ' ' + Math.abs(input.trend) + '%';
        }
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }), '*');
      }
    });
    render(defaultData);
  </script>
</body>
</html>`,

  // ============================================================================
  // Code Snippet Widget
  // ============================================================================
  "ui://code": `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${tokens.bg};
      color: ${tokens.text};
    }
    .container {
      height: 100%;
      display: flex;
      flex-direction: column;
      padding: 12px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      flex-shrink: 0;
    }
    .language {
      font-size: 11px;
      color: ${tokens.textMuted};
      background: ${tokens.bgSubtle};
      padding: 2px 8px;
      border-radius: 4px;
    }
    .copy {
      font-size: 11px;
      color: ${tokens.primary};
      background: none;
      border: none;
      cursor: pointer;
    }
    .copy:hover { text-decoration: underline; }
    pre {
      flex: 1;
      overflow: auto;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 12px;
      border-radius: 8px;
      font-family: ui-monospace, 'SF Mono', monospace;
      font-size: 12px;
      line-height: 1.5;
    }

    @media (min-height: 450px) {
      .container { padding: 20px; }
      .header { margin-bottom: 12px; }
      .language { font-size: 12px; padding: 4px 10px; }
      pre { font-size: 13px; padding: 16px; border-radius: 10px; }
    }
    @media (min-height: 750px) {
      .container { padding: 28px; }
      pre { font-size: 14px; padding: 20px; border-radius: 12px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="language" id="language">javascript</span>
      <button class="copy" onclick="copyCode()">Copy</button>
    </div>
    <pre id="code">function hello() {
  console.log("Hello, World!");
}</pre>
  </div>
  <script>
    function copyCode() {
      navigator.clipboard.writeText(document.getElementById('code').textContent);
    }
    window.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.method === 'ui/initialize') {
        const input = m.params?.toolInput || {};
        if (input.code) document.getElementById('code').textContent = input.code;
        if (input.language) document.getElementById('language').textContent = input.language;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
};

export function getResourceHtml(uri: string): string | undefined {
  return apps[uri];
}

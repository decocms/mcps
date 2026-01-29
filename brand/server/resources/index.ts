/**
 * MCP Apps Resources for Brand MCP
 *
 * Interactive UI resources for displaying brand identities and design systems.
 */
import { createPublicResource } from "@decocms/runtime";
import type { Env } from "../types/env.ts";

/**
 * Brand Preview App - Shows brand identity with colors, logos, typography
 */
const BRAND_PREVIEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brand Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      font-family: 'Inter', system-ui, sans-serif;
      background: #0f0f0f;
      color: #fff;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    .header {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #333;
    }
    
    .logo-container {
      width: 80px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1a1a1a;
      border-radius: 12px;
      overflow: hidden;
    }
    
    .logo-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    
    .logo-fallback {
      font-size: 2rem;
      font-weight: 700;
    }
    
    .brand-info h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }
    
    .brand-info .tagline {
      color: #888;
      font-size: 1rem;
    }
    
    .confidence-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .confidence-high { background: #22c55e20; color: #22c55e; }
    .confidence-medium { background: #f59e0b20; color: #f59e0b; }
    .confidence-low { background: #ef444420; color: #ef4444; }
    
    .section {
      margin-bottom: 2rem;
    }
    
    .section h2 {
      font-size: 1rem;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
    }
    
    .colors-grid {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    
    .color-swatch {
      text-align: center;
    }
    
    .color-swatch .swatch {
      width: 80px;
      height: 80px;
      border-radius: 12px;
      margin-bottom: 0.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    
    .color-swatch .name {
      font-weight: 600;
      font-size: 0.875rem;
    }
    
    .color-swatch .hex {
      font-family: monospace;
      font-size: 0.75rem;
      color: #888;
    }
    
    .logos-grid {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
    }
    
    .logo-variant {
      text-align: center;
    }
    
    .logo-variant .preview {
      width: 160px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      margin-bottom: 0.5rem;
      padding: 1rem;
    }
    
    .logo-variant .preview img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    
    .logo-variant .label {
      font-size: 0.75rem;
      color: #888;
      text-transform: uppercase;
    }
    
    .preview-dark { background: #0f0f0f; border: 1px solid #333; }
    .preview-light { background: #fff; }
    
    .typography-samples {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    .font-sample {
      padding: 1rem;
      background: #1a1a1a;
      border-radius: 8px;
    }
    
    .font-sample .label {
      font-size: 0.75rem;
      color: #888;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }
    
    .font-sample .preview {
      font-size: 1.5rem;
    }
    
    .style-guide-preview {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 1.5rem;
      max-height: 400px;
      overflow: auto;
    }
    
    .style-guide-preview pre {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      white-space: pre-wrap;
      color: #ccc;
    }
    
    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #666;
    }
    
    .empty-state h2 {
      font-size: 1.25rem;
      margin-bottom: 0.5rem;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="container" id="app">
    <div class="empty-state">
      <h2>Brand Preview</h2>
      <p>Waiting for brand data...</p>
    </div>
  </div>
  
  <script>
    let brandData = null;
    
    function renderBrand(data) {
      const { identity, css, jsx, styleGuide } = data;
      if (!identity) {
        document.getElementById('app').innerHTML = \`
          <div class="empty-state">
            <h2>No Brand Data</h2>
            <p>Run BRAND_CREATE or BRAND_DISCOVER to generate a brand.</p>
          </div>
        \`;
        return;
      }
      
      const colors = identity.colors || {};
      const logos = identity.logos || {};
      const typography = identity.typography || {};
      
      document.getElementById('app').innerHTML = \`
        <div class="header">
          <div class="logo-container">
            \${logos.primary 
              ? \`<img src="\${logos.primary}" alt="\${identity.name}">\`
              : \`<span class="logo-fallback" style="color: \${colors.primary || '#8B5CF6'}">\${identity.name[0]}</span>\`
            }
          </div>
          <div class="brand-info">
            <h1>\${identity.name}</h1>
            \${identity.tagline ? \`<p class="tagline">\${identity.tagline}</p>\` : ''}
          </div>
          <span class="confidence-badge confidence-\${identity.confidence || 'low'}">
            \${identity.confidence || 'low'} confidence
          </span>
        </div>
        
        <div class="section">
          <h2>Color Palette</h2>
          <div class="colors-grid">
            <div class="color-swatch">
              <div class="swatch" style="background: \${colors.primary || '#8B5CF6'}"></div>
              <div class="name">Primary</div>
              <div class="hex">\${colors.primary || '#8B5CF6'}</div>
            </div>
            \${colors.secondary ? \`
              <div class="color-swatch">
                <div class="swatch" style="background: \${colors.secondary}"></div>
                <div class="name">Secondary</div>
                <div class="hex">\${colors.secondary}</div>
              </div>
            \` : ''}
            \${colors.accent ? \`
              <div class="color-swatch">
                <div class="swatch" style="background: \${colors.accent}"></div>
                <div class="name">Accent</div>
                <div class="hex">\${colors.accent}</div>
              </div>
            \` : ''}
            \${colors.background ? \`
              <div class="color-swatch">
                <div class="swatch" style="background: \${colors.background}"></div>
                <div class="name">Background</div>
                <div class="hex">\${colors.background}</div>
              </div>
            \` : ''}
          </div>
        </div>
        
        \${logos.primary ? \`
          <div class="section">
            <h2>Logos</h2>
            <div class="logos-grid">
              <div class="logo-variant">
                <div class="preview preview-dark">
                  <img src="\${logos.primary}" alt="Primary">
                </div>
                <div class="label">Primary</div>
              </div>
              \${logos.light ? \`
                <div class="logo-variant">
                  <div class="preview preview-dark">
                    <img src="\${logos.light}" alt="Light">
                  </div>
                  <div class="label">Light</div>
                </div>
              \` : ''}
              \${logos.dark ? \`
                <div class="logo-variant">
                  <div class="preview preview-light">
                    <img src="\${logos.dark}" alt="Dark">
                  </div>
                  <div class="label">Dark</div>
                </div>
              \` : ''}
              \${logos.icon ? \`
                <div class="logo-variant">
                  <div class="preview preview-dark">
                    <img src="\${logos.icon}" alt="Icon">
                  </div>
                  <div class="label">Icon</div>
                </div>
              \` : ''}
            </div>
          </div>
        \` : ''}
        
        \${typography.headingFont || typography.bodyFont ? \`
          <div class="section">
            <h2>Typography</h2>
            <div class="typography-samples">
              \${typography.headingFont ? \`
                <div class="font-sample">
                  <div class="label">Heading Font</div>
                  <div class="preview" style="font-family: \${typography.headingFont}">
                    The quick brown fox jumps over the lazy dog
                  </div>
                </div>
              \` : ''}
              \${typography.bodyFont ? \`
                <div class="font-sample">
                  <div class="label">Body Font</div>
                  <div class="preview" style="font-family: \${typography.bodyFont}">
                    The quick brown fox jumps over the lazy dog
                  </div>
                </div>
              \` : ''}
            </div>
          </div>
        \` : ''}
        
        \${styleGuide ? \`
          <div class="section">
            <h2>Style Guide Preview</h2>
            <div class="style-guide-preview">
              <pre>\${styleGuide.substring(0, 2000)}\${styleGuide.length > 2000 ? '\\n\\n... (truncated)' : ''}</pre>
            </div>
          </div>
        \` : ''}
      \`;
    }
    
    // Listen for initialization message
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'ui/initialize') {
        const { toolInput, toolResult } = event.data;
        brandData = toolResult || toolInput;
        renderBrand(brandData);
      }
    });
    
    // Signal ready
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'ui/ready' }, '*');
    }
  </script>
</body>
</html>`;

/**
 * Brand List App - Shows all created brands
 */
const BRAND_LIST_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brand List</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      font-family: 'Inter', system-ui, sans-serif;
      background: #0f0f0f;
      color: #fff;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    .brands-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.5rem;
    }
    
    .brand-card {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 1.5rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .brand-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    
    .brand-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .brand-logo {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
    }
    
    .brand-logo img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    
    .brand-name {
      font-weight: 600;
      font-size: 1.125rem;
    }
    
    .brand-tagline {
      font-size: 0.875rem;
      color: #888;
    }
    
    .brand-colors {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    
    .color-dot {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    
    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Brands</h1>
    <div class="brands-grid" id="brands">
      <div class="empty-state">
        <p>No brands yet. Use BRAND_CREATE to create one.</p>
      </div>
    </div>
  </div>
  
  <script>
    function renderBrands(brands) {
      if (!brands || brands.length === 0) {
        document.getElementById('brands').innerHTML = \`
          <div class="empty-state">
            <p>No brands yet. Use BRAND_CREATE to create one.</p>
          </div>
        \`;
        return;
      }
      
      document.getElementById('brands').innerHTML = brands.map(brand => \`
        <div class="brand-card">
          <div class="brand-header">
            <div class="brand-logo" style="background: \${brand.colors?.primary || '#8B5CF6'}20">
              \${brand.logos?.icon 
                ? \`<img src="\${brand.logos.icon}" alt="\${brand.name}">\`
                : \`<span style="color: \${brand.colors?.primary || '#8B5CF6'}">\${brand.name[0]}</span>\`
              }
            </div>
            <div>
              <div class="brand-name">\${brand.name}</div>
              \${brand.tagline ? \`<div class="brand-tagline">\${brand.tagline}</div>\` : ''}
            </div>
          </div>
          <div class="brand-colors">
            <div class="color-dot" style="background: \${brand.colors?.primary || '#8B5CF6'}"></div>
            \${brand.colors?.secondary ? \`<div class="color-dot" style="background: \${brand.colors.secondary}"></div>\` : ''}
            \${brand.colors?.accent ? \`<div class="color-dot" style="background: \${brand.colors.accent}"></div>\` : ''}
          </div>
        </div>
      \`).join('');
    }
    
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'ui/initialize') {
        const { toolResult } = event.data;
        if (toolResult?.brands) {
          renderBrands(toolResult.brands);
        }
      }
    });
    
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'ui/ready' }, '*');
    }
  </script>
</body>
</html>`;

export const createBrandPreviewResource = (_env: Env) =>
  createPublicResource({
    uri: "ui://brand-preview",
    name: "Brand Preview",
    description: "Interactive preview of brand identity and design system",
    mimeType: "text/html;profile=mcp-app",
    read: () => ({
      uri: "ui://brand-preview",
      mimeType: "text/html;profile=mcp-app",
      text: BRAND_PREVIEW_HTML,
    }),
  });

export const createBrandListResource = (_env: Env) =>
  createPublicResource({
    uri: "ui://brand-list",
    name: "Brand List",
    description: "View all created brands",
    mimeType: "text/html;profile=mcp-app",
    read: () => ({
      uri: "ui://brand-list",
      mimeType: "text/html;profile=mcp-app",
      text: BRAND_LIST_HTML,
    }),
  });

export const resources = [createBrandPreviewResource, createBrandListResource];

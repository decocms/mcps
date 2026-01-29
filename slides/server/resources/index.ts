/**
 * MCP Apps Resources for Slides MCP
 *
 * Implements SEP-1865 MCP Apps for displaying slide presentations as UIs.
 *
 * Resources:
 * - ui://slides-viewer - Full presentation viewer with navigation
 * - ui://design-system - Brand design system preview
 * - ui://slide - Single slide preview
 */
import { createPublicResource } from "@decocms/runtime";
import type { Env } from "../types/env.ts";

/**
 * Slide Viewer App - Full presentation viewer with navigation
 *
 * Receives via ui/initialize:
 * - toolInput.slides: Array of slide objects
 * - toolInput.title: Presentation title
 * - toolInput.brand: Brand configuration
 */
const SLIDES_VIEWER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slides Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; background: #0f0f0f; }
    
    .container { width: 100%; height: 100%; display: flex; flex-direction: column; }
    .header { padding: 12px 16px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a; display: flex; align-items: center; gap: 12px; }
    .title { font-size: 14px; font-weight: 600; color: #fff; flex: 1; }
    .counter { font-size: 12px; color: #888; font-variant-numeric: tabular-nums; }
    
    .viewer { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; position: relative; }
    .slide-container { 
      width: 100%; max-width: 960px; aspect-ratio: 16/9; 
      background: #fff; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      overflow: hidden; position: relative;
    }
    .slide-frame { width: 100%; height: 100%; border: none; }
    
    .nav { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px; display: flex; justify-content: center; gap: 8px; }
    .nav-btn {
      width: 40px; height: 40px; border-radius: 50%; border: none;
      background: rgba(255,255,255,0.1); color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; font-size: 18px;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
    .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
    .nav-btn.primary { background: #8B5CF6; }
    
    .thumbnails {
      padding: 12px 16px; background: #1a1a1a; border-top: 1px solid #2a2a2a;
      display: flex; gap: 8px; overflow-x: auto; scrollbar-width: thin;
    }
    .thumb {
      width: 80px; height: 45px; flex-shrink: 0; border-radius: 4px;
      background: #2a2a2a; border: 2px solid transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: #666; transition: all 0.2s;
    }
    .thumb.active { border-color: #8B5CF6; }
    .thumb:hover { border-color: #666; }
    
    .empty { color: #666; text-align: center; padding: 48px; }
    .empty h2 { font-size: 24px; margin-bottom: 8px; color: #888; }
    .empty p { font-size: 14px; }
    
    /* Slide content styles */
    .slide { width: 100%; height: 100%; padding: 32px; display: flex; flex-direction: column; }
    .slide--title { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); color: #fff; justify-content: center; align-items: center; }
    .slide--title h1 { font-size: 48px; font-weight: 700; text-align: center; }
    .slide--content { background: #fff; }
    .slide--content h1 { font-size: 28px; font-weight: 700; color: #8B5CF6; margin-bottom: 16px; }
    .slide--content ul { list-style: none; padding-left: 0; }
    .slide--content li { padding-left: 20px; margin-bottom: 8px; position: relative; font-size: 16px; color: #333; }
    .slide--content li::before { content: ''; position: absolute; left: 0; top: 8px; width: 8px; height: 8px; background: #8B5CF6; border-radius: 50%; }
    .slide--stats { background: #fff; justify-content: center; }
    .slide--stats h1 { font-size: 24px; font-weight: 700; color: #8B5CF6; margin-bottom: 24px; text-align: center; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 24px; }
    .stat { text-align: center; }
    .stat-value { font-size: 36px; font-weight: 700; color: #8B5CF6; }
    .stat-label { font-size: 12px; color: #666; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="title" id="title">Presentation</span>
      <span class="counter" id="counter">0 / 0</span>
    </div>
    <div class="viewer">
      <div class="slide-container">
        <div class="slide" id="slide">
          <div class="empty">
            <h2>No slides</h2>
            <p>Waiting for presentation data...</p>
          </div>
        </div>
      </div>
      <div class="nav">
        <button class="nav-btn" id="prev" onclick="navigate(-1)">←</button>
        <button class="nav-btn primary" id="next" onclick="navigate(1)">→</button>
      </div>
    </div>
    <div class="thumbnails" id="thumbnails"></div>
  </div>
  <script>
    let slides = [];
    let currentIndex = 0;
    
    function renderSlide(slide) {
      if (!slide) return '<div class="empty"><h2>No slide</h2></div>';
      
      const layout = slide.layout || 'content';
      let html = '<div class="slide slide--' + layout + '">';
      
      if (layout === 'title') {
        html += '<h1>' + (slide.title || 'Untitled') + '</h1>';
      } else if (layout === 'stats') {
        html += '<h1>' + (slide.title || 'Stats') + '</h1>';
        html += '<div class="stats-grid">';
        (slide.items || []).forEach(item => {
          html += '<div class="stat"><div class="stat-value">' + (item.value || '0') + '</div><div class="stat-label">' + (item.label || '') + '</div></div>';
        });
        html += '</div>';
      } else {
        html += '<h1>' + (slide.title || 'Untitled') + '</h1>';
        html += '<ul>';
        (slide.items || []).forEach(item => {
          (item.bullets || []).forEach(b => {
            html += '<li>' + (b.text || '') + '</li>';
          });
        });
        html += '</ul>';
      }
      
      html += '</div>';
      return html;
    }
    
    function navigate(delta) {
      currentIndex = Math.max(0, Math.min(slides.length - 1, currentIndex + delta));
      update();
    }
    
    function goTo(index) {
      currentIndex = index;
      update();
    }
    
    function update() {
      document.getElementById('slide').innerHTML = renderSlide(slides[currentIndex]);
      document.getElementById('counter').textContent = (currentIndex + 1) + ' / ' + slides.length;
      document.getElementById('prev').disabled = currentIndex === 0;
      document.getElementById('next').disabled = currentIndex === slides.length - 1;
      
      document.querySelectorAll('.thumb').forEach((t, i) => {
        t.classList.toggle('active', i === currentIndex);
      });
    }
    
    function renderThumbnails() {
      const container = document.getElementById('thumbnails');
      container.innerHTML = '';
      slides.forEach((slide, i) => {
        const thumb = document.createElement('div');
        thumb.className = 'thumb' + (i === currentIndex ? ' active' : '');
        thumb.textContent = (i + 1);
        thumb.onclick = () => goTo(i);
        container.appendChild(thumb);
      });
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === ' ') navigate(1);
      if (e.key === 'ArrowLeft') navigate(-1);
    });
    
    // Handle MCP App initialization
    window.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        const result = msg.params?.toolResult || {};
        
        // Get slides from input or result
        slides = input.slides || result.slides || [];
        if (typeof slides === 'string') {
          try { slides = JSON.parse(slides); } catch { slides = []; }
        }
        
        // Set title
        const title = input.title || result.title || 'Presentation';
        document.getElementById('title').textContent = title;
        
        currentIndex = 0;
        renderThumbnails();
        update();
        
        // Acknowledge initialization
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`;

/**
 * Design System Viewer App - Preview brand design system
 *
 * Receives via ui/initialize:
 * - toolInput.brandName: Brand name
 * - toolInput.brandColor: Primary brand color
 * - toolInput.assets: Logo URLs
 */
const DESIGN_SYSTEM_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design System</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #0a0a0a; color: #fff; padding: 24px; min-height: 100vh; }
    
    .header { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #222; }
    .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .header p { font-size: 14px; color: #666; }
    
    .section { margin-bottom: 32px; }
    .section-title { font-size: 12px; font-weight: 600; color: var(--brand-color, #8B5CF6); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    
    .card { background: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #2a2a2a; }
    .card-preview { padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100px; }
    .card-preview.light { background: #f5f5f5; }
    .card-preview.dark { background: #1a1a1a; }
    .card-info { padding: 12px; border-top: 1px solid #2a2a2a; }
    .card-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
    .card-desc { font-size: 11px; color: #666; }
    
    .colors { display: flex; gap: 12px; flex-wrap: wrap; }
    .color { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .color-swatch { width: 48px; height: 48px; border-radius: 8px; border: 2px solid rgba(255,255,255,0.1); }
    .color-name { font-size: 11px; color: #888; }
    .color-value { font-size: 10px; color: #666; font-family: monospace; }
    
    .logo { max-height: 48px; max-width: 160px; object-fit: contain; }
    .logo-text { font-size: 24px; font-weight: 700; }
    
    .slide-preview { width: 100%; aspect-ratio: 16/9; background: #2a2a2a; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #666; }
    
    .warning { padding: 12px 16px; background: rgba(255,200,0,0.1); border: 1px solid rgba(255,200,0,0.3); border-radius: 8px; margin-top: 16px; }
    .warning p { font-size: 13px; color: #ffd666; }
  </style>
</head>
<body>
  <div class="header">
    <h1 id="brandName">Design System</h1>
    <p>Brand components for presentations</p>
  </div>
  
  <div class="section">
    <h2 class="section-title">Colors</h2>
    <div class="colors" id="colors">
      <div class="color">
        <div class="color-swatch" id="primarySwatch" style="background: #8B5CF6;"></div>
        <span class="color-name">Primary</span>
        <span class="color-value" id="primaryHex">#8B5CF6</span>
      </div>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">Logo</h2>
    <div class="grid">
      <div class="card">
        <div class="card-preview light" id="logoLight">
          <span class="logo-text" id="logoText">Brand</span>
        </div>
        <div class="card-info">
          <div class="card-name">Light Background</div>
          <div class="card-desc">For content slides</div>
        </div>
      </div>
      <div class="card">
        <div class="card-preview dark" id="logoDark">
          <span class="logo-text" id="logoTextDark" style="color: #fff;">Brand</span>
        </div>
        <div class="card-info">
          <div class="card-name">Dark Background</div>
          <div class="card-desc">For title slides</div>
        </div>
      </div>
    </div>
    <div class="warning" id="noLogoWarning" style="display: none;">
      <p>⚠️ No image logo configured. Using text fallback. Provide logo images via brand assets for professional presentations.</p>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">Sample Slides</h2>
    <div class="grid">
      <div class="card">
        <div class="card-preview dark">
          <div class="slide-preview">Title Slide</div>
        </div>
        <div class="card-info">
          <div class="card-name">Title Slide</div>
          <div class="card-desc">Opening slide with brand shapes</div>
        </div>
      </div>
      <div class="card">
        <div class="card-preview light">
          <div class="slide-preview" style="background: #f5f5f5;">Content Slide</div>
        </div>
        <div class="card-info">
          <div class="card-name">Content Slide</div>
          <div class="card-desc">Main content with bullets</div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    window.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        const result = msg.params?.toolResult || {};
        
        // Brand name
        const brandName = input.brandName || result.brandName || 'Brand';
        document.getElementById('brandName').textContent = brandName + ' Design System';
        document.getElementById('logoText').textContent = brandName;
        document.getElementById('logoTextDark').textContent = brandName;
        
        // Brand color
        const brandColor = input.brandColor || result.brandColor || input.assets?.brandColor || '#8B5CF6';
        document.documentElement.style.setProperty('--brand-color', brandColor);
        document.getElementById('primarySwatch').style.background = brandColor;
        document.getElementById('primaryHex').textContent = brandColor;
        
        // Logo images
        const assets = input.assets || result.assets || {};
        const logoUrl = assets.logoUrl || assets.logo;
        
        if (logoUrl) {
          const lightLogo = assets.logoDarkUrl || logoUrl;
          const darkLogo = assets.logoLightUrl || logoUrl;
          
          document.getElementById('logoLight').innerHTML = '<img class="logo" src="' + lightLogo + '" alt="' + brandName + '">';
          document.getElementById('logoDark').innerHTML = '<img class="logo" src="' + darkLogo + '" alt="' + brandName + '">';
          document.getElementById('noLogoWarning').style.display = 'none';
        } else {
          document.getElementById('noLogoWarning').style.display = 'block';
        }
        
        // Acknowledge
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`;

/**
 * Single Slide Preview App - Shows one slide
 */
const SINGLE_SLIDE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slide Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; background: #0a0a0a; }
    
    .container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .slide-frame {
      width: 100%; max-width: 800px; aspect-ratio: 16/9;
      background: #fff; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      overflow: hidden;
    }
    
    .slide { width: 100%; height: 100%; padding: 32px; display: flex; flex-direction: column; }
    .slide--title { background: linear-gradient(135deg, #1a1a1a 0%, #3d3d3d 100%); color: #fff; justify-content: center; align-items: center; }
    .slide--title h1 { font-size: 36px; font-weight: 700; text-align: center; line-height: 1.2; }
    .slide--content, .slide--list, .slide--two-column { background: #fff; }
    .slide--stats { background: #fff; justify-content: center; }
    
    .slide h1 { font-size: 24px; font-weight: 700; color: var(--brand-color, #8B5CF6); margin-bottom: 16px; }
    .slide .tag { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
    
    ul { list-style: none; padding: 0; }
    li { padding-left: 16px; margin-bottom: 6px; position: relative; font-size: 14px; color: #333; line-height: 1.4; }
    li::before { content: ''; position: absolute; left: 0; top: 6px; width: 6px; height: 6px; background: var(--brand-color, #8B5CF6); border-radius: 50%; }
    
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 16px; margin-top: 16px; }
    .stat { text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: var(--brand-color, #8B5CF6); }
    .stat-label { font-size: 11px; color: #666; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="slide-frame">
      <div class="slide" id="slide">
        <p style="color: #666; text-align: center;">Waiting for slide data...</p>
      </div>
    </div>
  </div>
  <script>
    function renderSlide(slide, brandColor) {
      if (!slide) return '<p style="color: #666; text-align: center;">No slide data</p>';
      
      document.documentElement.style.setProperty('--brand-color', brandColor || '#8B5CF6');
      
      const layout = slide.layout || 'content';
      let html = '<div class="slide slide--' + layout + '">';
      
      if (slide.tag) html += '<div class="tag">' + slide.tag + '</div>';
      
      if (layout === 'title') {
        html += '<h1>' + (slide.title || 'Untitled') + '</h1>';
      } else if (layout === 'stats') {
        html += '<h1>' + (slide.title || 'Stats') + '</h1>';
        html += '<div class="stats-grid">';
        (slide.items || []).forEach(item => {
          html += '<div class="stat"><div class="stat-value">' + (item.value || '0') + '</div><div class="stat-label">' + (item.label || '') + '</div></div>';
        });
        html += '</div>';
      } else {
        html += '<h1>' + (slide.title || 'Untitled') + '</h1>';
        if (slide.subtitle) html += '<p style="color:#666;margin-bottom:12px;">' + slide.subtitle + '</p>';
        html += '<ul>';
        (slide.items || []).forEach(item => {
          if (item.title) html += '<li><strong>' + item.title + '</strong></li>';
          (item.bullets || []).forEach(b => {
            html += '<li>' + (b.text || '') + '</li>';
          });
        });
        html += '</ul>';
      }
      
      html += '</div>';
      return html;
    }
    
    window.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        const result = msg.params?.toolResult?.slideFile || {};
        
        // Parse slide data
        let slide = input.slide || input;
        if (result.content) {
          try { slide = JSON.parse(result.content); } catch {}
        }
        
        const brandColor = input.brandColor || '#8B5CF6';
        document.getElementById('slide').innerHTML = renderSlide(slide, brandColor);
        
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`;

/**
 * Create resources for MCP Apps
 */
export const createSlidesViewerResource = (_env: Env) =>
  createPublicResource({
    uri: "ui://slides-viewer",
    name: "Slides Viewer",
    description:
      "Interactive slide presentation viewer with navigation and thumbnails",
    mimeType: "text/html;profile=mcp-app",
    read: () => ({
      uri: "ui://slides-viewer",
      mimeType: "text/html;profile=mcp-app",
      text: SLIDES_VIEWER_HTML,
    }),
  });

export const createDesignSystemResource = (_env: Env) =>
  createPublicResource({
    uri: "ui://design-system",
    name: "Design System Preview",
    description:
      "Brand design system preview showing colors, logos, and components",
    mimeType: "text/html;profile=mcp-app",
    read: () => ({
      uri: "ui://design-system",
      mimeType: "text/html;profile=mcp-app",
      text: DESIGN_SYSTEM_HTML,
    }),
  });

export const createSlidePreviewResource = (_env: Env) =>
  createPublicResource({
    uri: "ui://slide",
    name: "Slide Preview",
    description: "Single slide preview",
    mimeType: "text/html;profile=mcp-app",
    read: () => ({
      uri: "ui://slide",
      mimeType: "text/html;profile=mcp-app",
      text: SINGLE_SLIDE_HTML,
    }),
  });

/**
 * All resource factory functions.
 * Each factory takes env and returns a resource definition.
 */
export const resources = [
  createSlidesViewerResource,
  createDesignSystemResource,
  createSlidePreviewResource,
];

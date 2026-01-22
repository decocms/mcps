/**
 * Deck management tools for slide presentations.
 *
 * These tools handle initialization, info, preview, and bundling of slide decks.
 * The system uses JSX with Babel Standalone for browser transpilation.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";

// Default style guide template
const DEFAULT_STYLE_TEMPLATE = `# Presentation Style Guide

This document defines the visual style, tone, and design system for this presentation.
Edit this file to customize the look and feel of your slides.

## Brand Identity

**Company/Project:** [Your Company Name]
**Style:** Modern, professional, clean
**Primary Color:** #8B5CF6 (Purple)

## Color Palette

\`\`\`css
:root {
  /* Primary brand color - used for accents, headings, bullets */
  --brand-primary: #8B5CF6;
  --brand-primary-light: #A78BFA;
  
  /* Background colors */
  --bg-dark: #1a1a1a;
  --bg-light: #FFFFFF;
  --bg-gray: #E5E5E5;
  
  /* Text colors */
  --text-dark: #1A1A1A;
  --text-light: #FFFFFF;
  --text-muted: #6B7280;
  
  /* Accent for blobs/shapes */
  --shape-dark: #3D3D3D;
}
\`\`\`

## Typography

- **Font Family:** Inter, system-ui, sans-serif
- **Title Slides:** 72px, bold, uppercase for impact
- **Content Titles:** 36px, bold, brand color
- **Section Headings:** 24px, semibold, brand color  
- **Body Text:** 16px, regular, dark color
- **Tags/Labels:** 12px, uppercase, letter-spacing 0.1em

## Slide Layouts

### Title Slide
- Large background shape (blob) with curved edge
- Overlapping accent circle in brand color
- Bold uppercase title
- Logo in bottom-right corner

### Content Slide
- White/light background
- Logo in top-right header
- Purple/brand colored title and section headings
- Bullet points with brand-colored dots
- Bold key terms in brand color
- Footer with source citations

### Stats Slide
- Large numbers in brand color
- Labels below each stat
- Grid layout for 3-4 stats

### Two-Column Slide
- Side-by-side comparison
- Column titles in brand color
- Bullet lists in each column

### List Slide  
- 2x2 grid of items
- Dot + title + description pattern

## Customizing the Design System

Edit \`design-system.jsx\` to customize components. Key components:
- \`BrandLogo\`: Your company logo
- \`SlideWrapper\`: Base slide container
- \`TitleSlide\`, \`ContentSlide\`, etc.: Individual layouts

All styling uses CSS classes from \`styles.css\` with CSS variables for easy theming.
`;

// Design System JSX - Real JSX syntax
const getDesignSystemJSX = (brandName = "Brand", tagline = "TAGLINE") => `/**
 * Design System
 * Brand components for presentations using real JSX
 * Requires: React, @babel/standalone
 */

(() => {
  // ============================================================================
  // BRAND: Logo
  // ============================================================================

  function BrandLogo({ size = "normal", className = "" }) {
    const isSmall = size === "small";
    
    return (
      <div className={\`logo-brand \${isSmall ? "logo-small" : ""} \${className}\`}>
        <span className="logo-brand-wordmark">${brandName}</span>
        <span className="logo-brand-tagline">${tagline}</span>
      </div>
    );
  }

  // ============================================================================
  // LAYOUT: Slide Wrapper
  // ============================================================================

  function SlideWrapper({ children, variant = "content", className = "" }) {
    return (
      <div 
        className={\`slide slide--\${variant} \${className}\`}
        style={{ opacity: 1 }}
      >
        {children}
      </div>
    );
  }

  function SlideHeader() {
    return (
      <header className="slide-header">
        <BrandLogo size="small" />
      </header>
    );
  }

  function SlideFooter({ source, label }) {
    if (!source) return null;
    
    return (
      <footer className="slide-footer">
        <span className="footer-text">Source: {source}</span>
        {label && <span className="footer-label">{label}</span>}
        <div className="footer-dot" />
      </footer>
    );
  }

  function Tag({ children }) {
    if (!children) return null;
    return <span className="slide-tag">{children}</span>;
  }

  // ============================================================================
  // CONTENT: Bullets
  // ============================================================================

  function BulletList({ items, nested = false }) {
    if (!items?.length) return null;
    
    return (
      <ul className={\`bullet-list \${nested ? "bullet-list--nested" : ""}\`}>
        {items.map((item, idx) => (
          <li key={idx}>
            {item.highlight ? (
              <span className="text-bold">{item.text}</span>
            ) : (
              item.text
            )}
          </li>
        ))}
      </ul>
    );
  }

  function Section({ title, bullets, nestedBullets }) {
    return (
      <div className="section">
        {title && <h2 className="section-heading">{title}</h2>}
        <BulletList items={bullets} />
        <BulletList items={nestedBullets} nested />
      </div>
    );
  }

  // ============================================================================
  // SLIDES: Title
  // ============================================================================

  function TitleSlide({ slide }) {
    return (
      <SlideWrapper variant="title">
        <div className="blob-primary" />
        <div className="blob-accent" />
        <div className="slide-content">
          <h1 className="title-hero">{slide.title}</h1>
        </div>
        <div className="logo-container">
          <BrandLogo size="normal" />
        </div>
      </SlideWrapper>
    );
  }

  // ============================================================================
  // SLIDES: Content
  // ============================================================================

  function ContentSlide({ slide }) {
    const items = slide.items || [];
    
    return (
      <SlideWrapper variant="content">
        <SlideHeader />
        <main className="slide-body">
          <h1 className="slide-title">{slide.title}</h1>
          {items.map((item, idx) => (
            <Section 
              key={idx}
              title={item.title}
              bullets={item.bullets}
              nestedBullets={item.nestedBullets}
            />
          ))}
        </main>
        <SlideFooter source={slide.source} label={slide.label} />
      </SlideWrapper>
    );
  }

  // ============================================================================
  // SLIDES: Stats
  // ============================================================================

  function StatItem({ value, label }) {
    return (
      <div className="stat-item">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    );
  }

  function StatsSlide({ slide }) {
    const items = slide.items || [];
    
    return (
      <SlideWrapper variant="content" className="slide--stats">
        <SlideHeader />
        <Tag>{slide.tag}</Tag>
        <h1 className="slide-title">{slide.title}</h1>
        <div className="stats-grid">
          {items.map((item, idx) => (
            <StatItem key={idx} value={item.value} label={item.label} />
          ))}
        </div>
      </SlideWrapper>
    );
  }

  // ============================================================================
  // SLIDES: Two Column
  // ============================================================================

  function Column({ title, bullets }) {
    return (
      <div className="column">
        {title && <h3 className="column-title">{title}</h3>}
        <BulletList items={bullets} />
      </div>
    );
  }

  function TwoColumnSlide({ slide }) {
    const [left, right] = slide.items || [];
    
    return (
      <SlideWrapper variant="content" className="slide--two-column">
        <SlideHeader />
        <main className="slide-body">
          <Tag>{slide.tag}</Tag>
          <h1 className="slide-title">{slide.title}</h1>
          <div className="columns">
            <Column title={left?.title} bullets={left?.bullets} />
            <Column title={right?.title} bullets={right?.bullets} />
          </div>
        </main>
      </SlideWrapper>
    );
  }

  // ============================================================================
  // SLIDES: List (2x2 Grid)
  // ============================================================================

  function ListItem({ title, subtitle }) {
    return (
      <div className="list-item">
        <div className="list-item-dot" />
        <div className="list-item-content">
          <h4>{title}</h4>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
    );
  }

  function ListSlide({ slide }) {
    const items = slide.items || [];
    
    return (
      <SlideWrapper variant="content" className="slide--list">
        <SlideHeader />
        <main className="slide-body">
          <Tag>{slide.tag}</Tag>
          <h1 className="slide-title">{slide.title}</h1>
          {slide.subtitle && <p className="slide-subtitle">{slide.subtitle}</p>}
          <div className="list-grid">
            {items.map((item, idx) => (
              <ListItem key={idx} title={item.title} subtitle={item.subtitle} />
            ))}
          </div>
        </main>
      </SlideWrapper>
    );
  }

  // ============================================================================
  // COMPONENT REGISTRY - Expose globally
  // ============================================================================

  window.DesignSystem = {
    // Slide components
    SlideComponents: {
      title: TitleSlide,
      content: ContentSlide,
      stats: StatsSlide,
      "two-column": TwoColumnSlide,
      list: ListSlide,
    },
    // Individual components for custom slides
    BrandLogo,
    TitleSlide,
    ContentSlide,
    StatsSlide,
    TwoColumnSlide,
    ListSlide,
    // Building blocks
    SlideWrapper,
    SlideHeader,
    SlideFooter,
    BulletList,
    Section,
    Tag,
  };

  console.log("✓ Design System loaded");
})();
`;

// Engine JSX - Real JSX syntax
const getEngineJSX = () => `/**
 * Presentation Engine
 * Core logic for slide navigation, scaling, and rendering
 * Requires: React, ReactDOM, design-system.jsx loaded first
 */

(() => {
  const { useState, useEffect, useRef } = React;

  // Base dimensions (16:9 aspect ratio)
  const BASE_WIDTH = 1366;
  const BASE_HEIGHT = 768;

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  function Navigation({ current, total, onNavigate, disabled }) {
    const goFirst = () => onNavigate(0);
    const goPrev = () => onNavigate(current - 1);
    const goNext = () => onNavigate(current + 1);
    
    const toggleFullscreen = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    };
    
    const indicator = \`\${String(current + 1).padStart(2, "0")} / \${String(total).padStart(2, "0")}\`;
    
    return (
      <div className="nav-controls">
        <span className="nav-indicator">{indicator}</span>
        <button 
          className="nav-btn" 
          onClick={goFirst} 
          disabled={current === 0 || disabled}
          title="First slide"
        >
          ⏮
        </button>
        <button 
          className="nav-btn" 
          onClick={goPrev} 
          disabled={current === 0 || disabled}
          title="Previous slide"
        >
          ←
        </button>
        <button 
          className="nav-btn nav-btn--primary" 
          onClick={goNext} 
          disabled={current === total - 1 || disabled}
          title="Next slide"
        >
          →
        </button>
        <button 
          className="nav-btn" 
          onClick={toggleFullscreen}
          title="Toggle fullscreen"
        >
          ⛶
        </button>
      </div>
    );
  }

  // ============================================================================
  // PRESENTATION
  // ============================================================================

  function Presentation({ slides, title, subtitle }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [scale, setScale] = useState(1);
    const containerRef = useRef(null);
    
    const { SlideComponents } = window.DesignSystem;
    
    // Calculate scale to fit viewport
    useEffect(() => {
      const calculateScale = () => {
        if (!containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        const scaleX = clientWidth / BASE_WIDTH;
        const scaleY = clientHeight / BASE_HEIGHT;
        setScale(Math.min(scaleX, scaleY) * 0.95);
      };
      
      calculateScale();
      window.addEventListener("resize", calculateScale);
      return () => window.removeEventListener("resize", calculateScale);
    }, []);
    
    // Keyboard navigation
    useEffect(() => {
      const handleKeyDown = (e) => {
        if (isAnimating) return;
        
        const actions = {
          ArrowRight: () => goToSlide(Math.min(currentSlide + 1, slides.length - 1)),
          ArrowDown: () => goToSlide(Math.min(currentSlide + 1, slides.length - 1)),
          " ": () => goToSlide(Math.min(currentSlide + 1, slides.length - 1)),
          ArrowLeft: () => goToSlide(Math.max(currentSlide - 1, 0)),
          ArrowUp: () => goToSlide(Math.max(currentSlide - 1, 0)),
          Home: () => goToSlide(0),
          End: () => goToSlide(slides.length - 1),
        };
        
        if (actions[e.key]) {
          e.preventDefault();
          actions[e.key]();
        }
      };
      
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentSlide, isAnimating, slides.length]);
    
    const goToSlide = (index) => {
      if (index === currentSlide || isAnimating) return;
      setIsAnimating(true);
      setCurrentSlide(index);
      setTimeout(() => setIsAnimating(false), 300);
    };
    
    // Render current slide
    const slide = slides[currentSlide];
    const SlideComponent = SlideComponents[slide?.layout] || SlideComponents.content;
    
    const displayWidth = BASE_WIDTH * scale;
    const displayHeight = BASE_HEIGHT * scale;
    
    return (
      <div ref={containerRef} className="presentation-container">
        <div 
          style={{
            width: \`\${displayWidth}px\`,
            height: \`\${displayHeight}px\`,
            position: "relative",
          }}
        >
          <div 
            style={{
              width: \`\${BASE_WIDTH}px\`,
              height: \`\${BASE_HEIGHT}px\`,
              transform: \`scale(\${scale})\`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            {slide && <SlideComponent slide={slide} />}
          </div>
        </div>
        
        <Navigation 
          current={currentSlide}
          total={slides.length}
          onNavigate={goToSlide}
          disabled={isAnimating}
        />
      </div>
    );
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function initPresentation(manifestPath = "./slides/manifest.json") {
    try {
      const response = await fetch(manifestPath);
      const manifest = await response.json();
      
      const slides = await Promise.all(
        manifest.slides.map(async (slideInfo) => {
          try {
            const slideResponse = await fetch(\`./slides/\${slideInfo.file}\`);
            const slideData = await slideResponse.json();
            return { ...slideInfo, ...slideData };
          } catch (e) {
            console.error(\`Failed to load slide: \${slideInfo.file}\`, e);
            return slideInfo;
          }
        })
      );
      
      const root = ReactDOM.createRoot(document.getElementById("root"));
      root.render(
        <Presentation 
          slides={slides}
          title={manifest.title}
          subtitle={manifest.subtitle}
        />
      );
      
      console.log(\`✓ Presentation loaded: \${slides.length} slides\`);
    } catch (e) {
      console.error("Failed to initialize presentation:", e);
      document.getElementById("root").innerHTML = \`
        <div class="error">
          <h1>Presentation not found</h1>
          <p>Create slides/manifest.json to get started.</p>
        </div>
      \`;
    }
  }

  window.Presentation = Presentation;
  window.initPresentation = initPresentation;
  
  console.log("✓ Engine loaded");
})();
`;

// Design System Viewer HTML
const getDesignViewerHTML = (brandColor = "#8B5CF6") => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design System Viewer</title>
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js"></script>
  <link rel="stylesheet" href="./styles.css">
  <style>
    body { background: #0a0a0a; overflow: auto; }
    .ds-viewer { max-width: 1400px; margin: 0 auto; padding: 48px 24px; font-family: 'Inter', system-ui, sans-serif; }
    .ds-header { margin-bottom: 48px; padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .ds-header h1 { font-size: 36px; font-weight: 700; color: white; margin: 0 0 8px 0; }
    .ds-header p { font-size: 16px; color: rgba(255,255,255,0.5); margin: 0; }
    .ds-section { margin-bottom: 64px; }
    .ds-section-title { font-size: 14px; font-weight: 600; color: var(--brand-primary); text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 24px 0; }
    .ds-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
    .ds-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; }
    .ds-card-preview { padding: 32px; background: rgba(255,255,255,0.02); display: flex; align-items: center; justify-content: center; min-height: 120px; }
    .ds-card-preview.light { background: #f5f5f5; }
    .ds-card-preview.dark { background: #1a1a1a; }
    .ds-card-info { padding: 16px; border-top: 1px solid rgba(255,255,255,0.08); }
    .ds-card-name { font-size: 14px; font-weight: 600; color: white; margin: 0 0 4px 0; }
    .ds-card-desc { font-size: 12px; color: rgba(255,255,255,0.5); margin: 0; }
    .ds-slide-preview { width: 100%; aspect-ratio: 16/9; position: relative; overflow: hidden; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    .ds-slide-preview .slide { position: absolute; top: 0; left: 0; transform-origin: top left; }
    .ds-colors { display: flex; gap: 12px; flex-wrap: wrap; }
    .ds-color { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .ds-color-swatch { width: 64px; height: 64px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.1); }
    .ds-color-name { font-size: 11px; color: rgba(255,255,255,0.7); text-align: center; }
    .ds-color-value { font-size: 10px; color: rgba(255,255,255,0.4); font-family: monospace; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" src="./design-system.jsx" data-presets="react"></script>
  <script type="text/babel" data-presets="react">
    setTimeout(() => {
      const { BrandLogo, TitleSlide, ContentSlide, StatsSlide, TwoColumnSlide, ListSlide, BulletList, Tag } = window.DesignSystem;
      
      const sampleSlides = {
        title: { title: "SAMPLE TITLE" },
        content: { title: "Content Example", items: [{ title: "Section", bullets: [{ text: "Point one" }, { text: "Highlighted", highlight: true }] }], source: "Source 2026", label: "Public" },
        stats: { title: "Key Metrics", tag: "STATS", items: [{ value: "42K", label: "Users" }, { value: "98%", label: "Uptime" }, { value: "$1.2M", label: "Revenue" }, { value: "4.9★", label: "Rating" }] },
        twoColumn: { title: "Comparison", tag: "ANALYSIS", items: [{ title: "Option A", bullets: [{ text: "Benefit one" }] }, { title: "Option B", bullets: [{ text: "Benefit two" }] }] },
        list: { title: "Features", subtitle: "What we offer", tag: "PRODUCT", items: [{ title: "Feature 1", subtitle: "Description" }, { title: "Feature 2", subtitle: "Description" }, { title: "Feature 3", subtitle: "Description" }, { title: "Feature 4", subtitle: "Description" }] }
      };
      
      function SlidePreview({ children, scale = 0.25 }) {
        return (
          <div className="ds-slide-preview" style={{ width: 1366 * scale, height: 768 * scale }}>
            <div style={{ transform: \`scale(\${scale})\`, transformOrigin: 'top left', width: 1366, height: 768 }}>{children}</div>
          </div>
        );
      }
      
      const colors = [
        { name: "Primary", hex: "${brandColor}" },
        { name: "Shape Dark", hex: "#3D3D3D" },
        { name: "Gray", hex: "#E5E5E5" },
        { name: "White", hex: "#FFFFFF" },
        { name: "Dark", hex: "#1a1a1a" },
        { name: "Text Muted", hex: "#6B7280" },
      ];
      
      function Viewer() {
        return (
          <div className="ds-viewer">
            <header className="ds-header">
              <h1>Design System</h1>
              <p>Component library for presentations</p>
            </header>
            
            <section className="ds-section">
              <h2 className="ds-section-title">Color Palette</h2>
              <div className="ds-colors">
                {colors.map(c => (
                  <div key={c.name} className="ds-color">
                    <div className="ds-color-swatch" style={{ background: c.hex }} />
                    <span className="ds-color-name">{c.name}</span>
                    <span className="ds-color-value">{c.hex}</span>
                  </div>
                ))}
              </div>
            </section>
            
            <section className="ds-section">
              <h2 className="ds-section-title">Brand Logo</h2>
              <div className="ds-grid">
                <div className="ds-card">
                  <div className="ds-card-preview light"><BrandLogo size="normal" /></div>
                  <div className="ds-card-info"><h3 className="ds-card-name">BrandLogo (normal)</h3><p className="ds-card-desc">For title slides</p></div>
                </div>
                <div className="ds-card">
                  <div className="ds-card-preview light"><BrandLogo size="small" /></div>
                  <div className="ds-card-info"><h3 className="ds-card-name">BrandLogo (small)</h3><p className="ds-card-desc">For headers</p></div>
                </div>
              </div>
            </section>
            
            <section className="ds-section">
              <h2 className="ds-section-title">Components</h2>
              <div className="ds-grid">
                <div className="ds-card">
                  <div className="ds-card-preview light"><Tag>SAMPLE TAG</Tag></div>
                  <div className="ds-card-info"><h3 className="ds-card-name">Tag</h3><p className="ds-card-desc">Uppercase label</p></div>
                </div>
                <div className="ds-card">
                  <div className="ds-card-preview light" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <BulletList items={[{ text: "Regular" }, { text: "Highlighted", highlight: true }]} />
                  </div>
                  <div className="ds-card-info"><h3 className="ds-card-name">BulletList</h3><p className="ds-card-desc">With highlights</p></div>
                </div>
              </div>
            </section>
            
            <section className="ds-section">
              <h2 className="ds-section-title">Slide Layouts</h2>
              <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
                {[
                  { name: 'TitleSlide', desc: 'Opening slide with blobs', Comp: TitleSlide, data: sampleSlides.title },
                  { name: 'ContentSlide', desc: 'Main content with bullets', Comp: ContentSlide, data: sampleSlides.content },
                  { name: 'StatsSlide', desc: 'Large numbers grid', Comp: StatsSlide, data: sampleSlides.stats },
                  { name: 'TwoColumnSlide', desc: 'Side-by-side comparison', Comp: TwoColumnSlide, data: sampleSlides.twoColumn },
                  { name: 'ListSlide', desc: '2x2 feature grid', Comp: ListSlide, data: sampleSlides.list },
                ].map(({ name, desc, Comp, data }) => (
                  <div key={name} className="ds-card">
                    <div className="ds-card-preview dark" style={{ padding: 16 }}>
                      <SlidePreview scale={0.28}><Comp slide={data} /></SlidePreview>
                    </div>
                    <div className="ds-card-info"><h3 className="ds-card-name">{name}</h3><p className="ds-card-desc">{desc}</p></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        );
      }
      
      ReactDOM.createRoot(document.getElementById("root")).render(<Viewer />);
    }, 200);
  </script>
</body>
</html>`;

// CSS with variables for easy customization
const getStylesCSS = () => `/* Slides Presentation Styles */
/* Customize by editing the CSS variables below */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  /* Brand Colors - CUSTOMIZE THESE */
  --brand-primary: #8B5CF6;
  --brand-primary-light: #A78BFA;
  
  /* Background Colors */
  --bg-shape-dark: #3D3D3D;
  --bg-gray: #E5E5E5;
  --bg-white: #FFFFFF;
  --bg-dark: #1a1a1a;
  
  /* Text Colors */
  --text-dark: #1A1A1A;
  --text-light: #FFFFFF;
  --text-muted: #6B7280;
  --text-secondary: #9CA3AF;
  
  /* Slide Dimensions */
  --slide-width: 1366px;
  --slide-height: 768px;
  --margin-x: 48px;
  --margin-y: 40px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%; height: 100%; overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--bg-dark);
  -webkit-font-smoothing: antialiased;
}
#root { width: 100%; height: 100%; }

.presentation-container {
  width: 100vw; height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-dark);
}

.slide {
  width: var(--slide-width); height: var(--slide-height);
  position: absolute; overflow: hidden;
  transform-origin: center center;
}

/* Title Slide */
.slide--title { background: var(--bg-gray); }
.blob-primary {
  position: absolute; width: 70%; height: 130%;
  background: var(--bg-shape-dark);
  border-radius: 0 50% 50% 0; left: 0; top: -15%; z-index: 1;
}
.blob-accent {
  position: absolute; width: 380px; height: 380px;
  background: var(--brand-primary);
  border-radius: 50%; right: 12%; top: -8%; z-index: 2;
}
.slide--title .slide-content {
  position: relative; z-index: 3;
  padding: 0 var(--margin-x); height: 100%;
  display: flex; flex-direction: column; justify-content: center;
}
.title-hero {
  font-size: 72px; font-weight: 700; color: var(--text-light);
  line-height: 1.1; letter-spacing: -0.02em;
  text-transform: uppercase; max-width: 60%;
}
.logo-container {
  position: absolute; bottom: var(--margin-y);
  right: var(--margin-x); z-index: 3;
}

/* Brand Logo */
.logo-brand { display: flex; flex-direction: column; font-size: 42px; }
.logo-brand.logo-small { font-size: 28px; }
.logo-brand-wordmark {
  font-weight: 700; color: var(--bg-shape-dark); letter-spacing: -0.02em;
}
.logo-brand-tagline {
  font-size: 11px; font-weight: 500; color: var(--bg-shape-dark);
  letter-spacing: 0.2em; text-transform: uppercase; margin-top: 2px;
}

/* Content Slide */
.slide--content {
  background: var(--bg-white);
  padding: var(--margin-y) var(--margin-x);
  display: flex; flex-direction: column;
}
.slide-header {
  display: flex; justify-content: flex-end; margin-bottom: 16px;
}
.slide-body { flex: 1; overflow: hidden; }
.slide-title {
  font-size: 36px; font-weight: 700;
  color: var(--brand-primary); line-height: 1.2; margin-bottom: 20px;
}
.slide-tag {
  font-size: 12px; font-weight: 500; color: var(--text-secondary);
  letter-spacing: 0.1em; text-transform: uppercase;
  margin-bottom: 8px; display: block;
}
.slide-subtitle {
  font-size: 16px; color: var(--text-muted); margin-bottom: 16px;
}
.section-heading {
  font-size: 24px; font-weight: 600;
  color: var(--brand-primary); line-height: 1.3;
  margin-top: 28px; margin-bottom: 16px;
}

/* Bullet Lists */
.bullet-list { list-style: none; padding: 0; margin: 0 0 16px 0; }
.bullet-list > li {
  position: relative; padding-left: 24px; margin-bottom: 14px;
  font-size: 16px; line-height: 1.5; color: var(--text-dark);
}
.bullet-list > li::before {
  content: ''; position: absolute; left: 0; top: 8px;
  width: 8px; height: 8px; background: var(--brand-primary); border-radius: 50%;
}
.bullet-list--nested { margin-left: 32px; margin-top: 10px; }
.bullet-list--nested > li::before {
  background: transparent; border: 2px solid var(--brand-primary);
  width: 6px; height: 6px;
}
.text-bold { font-weight: 600; color: var(--brand-primary); }

/* Footer */
.slide-footer {
  display: flex; align-items: center; gap: 16px;
  padding-top: 16px; margin-top: auto; position: relative;
}
.footer-text { font-size: 11px; color: var(--text-muted); }
.footer-label { font-size: 11px; font-weight: 500; color: var(--text-muted); }
.footer-dot {
  position: absolute; right: 0; bottom: 0;
  width: 40px; height: 40px; background: var(--brand-primary-light);
  border-radius: 50%; opacity: 0.7;
}

/* Stats Slide */
.stats-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 32px; margin-top: auto; margin-bottom: auto;
}
.stat-item { text-align: center; }
.stat-value {
  font-size: 64px; font-weight: 700;
  color: var(--brand-primary); line-height: 1; margin-bottom: 8px;
}
.stat-label { font-size: 16px; font-weight: 500; color: var(--text-muted); }

/* Two Column */
.columns { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 24px; }
.column-title {
  font-size: 20px; font-weight: 600;
  color: var(--brand-primary); margin-bottom: 16px;
}

/* List Slide */
.list-grid {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 32px 48px; margin-top: 32px;
}
.list-item { display: flex; align-items: flex-start; gap: 16px; }
.list-item-dot {
  width: 10px; height: 10px; background: var(--brand-primary);
  border-radius: 50%; flex-shrink: 0; margin-top: 6px;
}
.list-item-content h4 {
  font-size: 18px; font-weight: 600; color: var(--text-dark); margin-bottom: 4px;
}
.list-item-content p { font-size: 14px; color: var(--text-muted); line-height: 1.4; }

/* Navigation */
.nav-controls {
  position: fixed; bottom: 24px; right: 24px;
  display: flex; align-items: center; gap: 12px; z-index: 100;
}
.nav-indicator {
  font-size: 13px; color: rgba(255,255,255,0.5);
  font-variant-numeric: tabular-nums; margin-right: 8px;
}
.nav-btn {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.8); cursor: pointer; transition: all 0.2s;
}
.nav-btn:hover:not(:disabled) { background: rgba(255,255,255,0.2); }
.nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.nav-btn--primary {
  background: var(--brand-primary); border-color: var(--brand-primary); color: white;
}

/* Error & Loading states */
.error {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100vh; color: var(--brand-primary); font-family: Inter, sans-serif;
}
.error h1 { font-size: 36px; font-weight: 700; }
.error p { font-size: 16px; color: var(--text-muted); margin-top: 8px; }
.loading {
  display: flex; align-items: center; justify-content: center;
  height: 100vh; color: var(--text-muted); font-family: Inter, sans-serif;
}
`;

/**
 * DECK_INIT - Initialize a new slide deck with JSX architecture
 */
export const createDeckInitTool = (_env: Env) =>
  createTool({
    id: "DECK_INIT",
    description: `Initialize a new slide deck or brand.

**Two modes:**

1. **Create a BRAND** (no 'brand' parameter):
   Creates all files for a reusable brand in brands/{brandSlug}/
   - design-system.jsx, styles.css, design.html, style.md

2. **Create a DECK** (with 'brand' parameter):
   Creates only deck files in decks/{deckSlug}/, references brand
   - index.html (loads from ../../brands/{brand}/)
   - engine.jsx
   - slides/manifest.json

The deck's index.html will load design-system.jsx and styles.css from the brand folder.`,
    inputSchema: z.object({
      title: z.string().describe("Presentation or brand title"),
      subtitle: z.string().optional().describe("Presentation subtitle or date"),
      brand: z
        .string()
        .optional()
        .describe(
          "Brand slug to use (e.g., 'cogna'). If provided, creates a deck referencing this brand. If not provided, creates a new brand.",
        ),
      brandName: z
        .string()
        .optional()
        .describe("Brand name for logo (only for new brands)"),
      brandTagline: z
        .string()
        .optional()
        .describe("Brand tagline (only for new brands)"),
      brandColor: z
        .string()
        .optional()
        .describe("Primary brand color in hex (only for new brands)"),
    }),
    outputSchema: z.object({
      files: z
        .array(
          z.object({
            path: z.string().describe("Relative file path"),
            content: z.string().describe("File content"),
          }),
        )
        .describe("Files to create"),
      message: z.string(),
      mode: z
        .enum(["brand", "deck"])
        .describe("Whether this created a brand or deck"),
    }),
    execute: async ({ context }) => {
      const { title, subtitle, brand, brandName, brandTagline, brandColor } =
        context;
      const now = new Date().toISOString();

      // MODE: Create a DECK referencing an existing brand
      if (brand) {
        const brandPath = `../../brands/${brand}`;

        const manifest = {
          title: title || "Presentation",
          subtitle: subtitle || "",
          brand: brand,
          createdAt: now,
          updatedAt: now,
          slides: [],
        };

        const deckIndexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || "Presentation"}</title>
  
  <!-- React -->
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
  
  <!-- Babel Standalone -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js"></script>
  
  <!-- GSAP -->
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  
  <!-- Brand: ${brand} -->
  <link rel="stylesheet" href="${brandPath}/styles.css">
</head>
<body>
  <div id="root"><div class="loading">Loading...</div></div>
  
  <!-- Design System from brand -->
  <script type="text/babel" src="${brandPath}/design-system.jsx" data-presets="react"></script>
  
  <!-- Engine -->
  <script type="text/babel" src="./engine.jsx" data-presets="react"></script>
  
  <!-- Initialize -->
  <script type="text/babel" data-presets="react">
    setTimeout(() => {
      if (window.initPresentation) {
        initPresentation('./slides/manifest.json');
      } else {
        console.error('Engine not loaded');
      }
    }, 200);
  </script>
</body>
</html>`;

        return {
          files: [
            { path: "index.html", content: deckIndexHtml },
            { path: "engine.jsx", content: getEngineJSX() },
            {
              path: "slides/manifest.json",
              content: JSON.stringify(manifest, null, 2),
            },
          ],
          message: `Deck "${title}" created using brand "${brand}". Save to decks/{deck-name}/. Serve with: npx serve`,
          mode: "deck" as const,
        };
      }

      // MODE: Create a new BRAND
      let stylesCSS = getStylesCSS();
      if (brandColor) {
        stylesCSS = stylesCSS.replace(/#8B5CF6/g, brandColor);
      }

      return {
        files: [
          {
            path: "design-system.jsx",
            content: getDesignSystemJSX(
              brandName || "Brand",
              brandTagline || "TAGLINE",
            ),
          },
          { path: "styles.css", content: stylesCSS },
          {
            path: "design.html",
            content: getDesignViewerHTML(brandColor || "#8B5CF6"),
          },
          { path: "style.md", content: DEFAULT_STYLE_TEMPLATE },
        ],
        message: `Brand "${brandName || title}" created. Save to brands/{brand-slug}/. Preview design system at /design.html`,
        mode: "brand" as const,
      };
    },
  });

/**
 * DECK_INFO - Get information about a slide deck
 */
export const createDeckInfoTool = (_env: Env) =>
  createTool({
    id: "DECK_INFO",
    description: "Get information about a slide deck from its manifest.",
    inputSchema: z.object({
      manifest: z.string().describe("Content of manifest.json"),
    }),
    outputSchema: z.object({
      title: z.string(),
      subtitle: z.string(),
      slideCount: z.number(),
      slides: z.array(
        z.object({ id: z.string(), title: z.string(), layout: z.string() }),
      ),
    }),
    execute: async ({ context }) => {
      const manifest = JSON.parse(context.manifest);
      return {
        title: manifest.title || "Untitled",
        subtitle: manifest.subtitle || "",
        slideCount: manifest.slides?.length || 0,
        slides: (manifest.slides || []).map((s: any) => ({
          id: s.id || s.file,
          title: s.title || "Untitled",
          layout: s.layout || "content",
        })),
      };
    },
  });

/**
 * DECK_BUNDLE - Bundle all slides into a single HTML file
 */
export const createDeckBundleTool = (_env: Env) =>
  createTool({
    id: "DECK_BUNDLE",
    description:
      "Bundle the entire slide deck into a single portable HTML file with embedded JSX.",
    inputSchema: z.object({
      manifest: z.string().describe("Content of manifest.json"),
      slides: z.array(
        z.object({
          file: z.string(),
          content: z.string().describe("JSON content of slide file"),
        }),
      ),
      stylesCss: z.string().describe("Content of styles.css"),
      designSystemJsx: z.string().describe("Content of design-system.jsx"),
    }),
    outputSchema: z.object({
      html: z.string().describe("Complete bundled HTML file"),
      slideCount: z.number(),
    }),
    execute: async ({ context }) => {
      const manifest = JSON.parse(context.manifest);
      const slides = context.slides.map((s) => JSON.parse(s.content));

      const bundledHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${manifest.title || "Presentation"}</title>
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
  <script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js"></script>
  <style>${context.stylesCss}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react">
${context.designSystemJsx}
  </script>
  <script type="text/babel" data-presets="react">
${getEngineJSX()}
  </script>
  <script type="text/babel" data-presets="react">
    const SLIDES = ${JSON.stringify(slides)};
    setTimeout(() => {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(<Presentation slides={SLIDES} title="${manifest.title}" />);
    }, 100);
  </script>
</body>
</html>`;

      return { html: bundledHtml, slideCount: slides.length };
    },
  });

/**
 * DECK_GET_ENGINE - Get the presentation engine JSX
 */
export const createDeckGetEngineTool = (_env: Env) =>
  createTool({
    id: "DECK_GET_ENGINE",
    description:
      "Get the presentation engine JSX. Save as engine.jsx in the deck directory.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      content: z.string().describe("JSX engine content"),
    }),
    execute: async () => ({ content: getEngineJSX() }),
  });

/**
 * DECK_GET_DESIGN_SYSTEM - Get the design system JSX
 */
export const createDeckGetDesignSystemTool = (_env: Env) =>
  createTool({
    id: "DECK_GET_DESIGN_SYSTEM",
    description:
      "Get the design system JSX template. Customize brand name/tagline and save as design-system.jsx.",
    inputSchema: z.object({
      brandName: z.string().optional().describe("Brand name for logo"),
      brandTagline: z.string().optional().describe("Brand tagline"),
    }),
    outputSchema: z.object({
      content: z.string().describe("JSX design system content"),
    }),
    execute: async ({ context }) => ({
      content: getDesignSystemJSX(
        context.brandName || "Brand",
        context.brandTagline || "TAGLINE",
      ),
    }),
  });

export const deckTools = [
  createDeckInitTool,
  createDeckInfoTool,
  createDeckBundleTool,
  createDeckGetEngineTool,
  createDeckGetDesignSystemTool,
];

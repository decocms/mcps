/**
 * Cogna Presentation Engine
 * Styled for Cogna Educação brand guidelines
 */

const { useState, useEffect, useRef } = React;

// Base dimensions (16:9 aspect ratio matching Cogna template)
const BASE_WIDTH = 1366;
const BASE_HEIGHT = 768;

/**
 * Cogna Logo Component
 */
function CognaLogo({ size = "normal", className = "" }) {
  const isSmall = size === "small";

  return React.createElement(
    "div",
    {
      className: `logo-cogna ${isSmall ? "logo-small" : ""} ${className}`,
    },
    [
      React.createElement(
        "span",
        {
          key: "wordmark",
          className: "logo-cogna-wordmark",
        },
        [
          "cogn",
          React.createElement("span", { key: "dot", className: "dot" }, "a"),
        ],
      ),
      React.createElement(
        "span",
        {
          key: "tagline",
          className: "logo-cogna-tagline",
        },
        "EDUCAÇÃO",
      ),
    ],
  );
}

/**
 * Title Slide with blob shapes
 */
function TitleSlide({ slide }) {
  return React.createElement(
    "div",
    {
      className: "slide slide--title",
      style: { opacity: 1 },
    },
    [
      // Charcoal blob
      React.createElement("div", { key: "blob1", className: "blob-primary" }),
      // Purple circle
      React.createElement("div", { key: "blob2", className: "blob-accent" }),
      // Content
      React.createElement(
        "div",
        { key: "content", className: "slide-content" },
        React.createElement("h1", { className: "title-hero" }, slide.title),
      ),
      // Logo
      React.createElement(
        "div",
        { key: "logo", className: "logo-container" },
        React.createElement(CognaLogo, { size: "normal" }),
      ),
    ],
  );
}

/**
 * Content Slide with bullets and sections
 */
function ContentSlide({ slide }) {
  const items = slide.items || [];

  const renderBullets = (bullets) => {
    return React.createElement(
      "ul",
      { className: "bullet-list" },
      bullets.map((bullet, idx) =>
        React.createElement(
          "li",
          { key: idx },
          bullet.highlight
            ? React.createElement(
                "span",
                { className: "text-bold" },
                bullet.text,
              )
            : bullet.text,
        ),
      ),
    );
  };

  const renderNestedBullets = (bullets) => {
    return React.createElement(
      "ul",
      { className: "bullet-list bullet-list--nested" },
      bullets.map((bullet, idx) =>
        React.createElement("li", { key: idx }, bullet.text),
      ),
    );
  };

  return React.createElement(
    "div",
    {
      className: "slide slide--content",
      style: { opacity: 1 },
    },
    [
      // Header with logo
      React.createElement(
        "header",
        { key: "header", className: "slide-header" },
        React.createElement(CognaLogo, { size: "small" }),
      ),
      // Body
      React.createElement("main", { key: "body", className: "slide-body" }, [
        // Title
        React.createElement(
          "h1",
          { key: "title", className: "slide-title" },
          slide.title,
        ),
        // Items
        ...items.map((item, idx) => {
          const elements = [];

          if (item.title) {
            elements.push(
              React.createElement(
                "h2",
                {
                  key: `section-${idx}`,
                  className: "section-heading",
                },
                item.title,
              ),
            );
          }

          if (item.bullets) {
            elements.push(
              React.createElement(
                "div",
                { key: `bullets-${idx}` },
                renderBullets(item.bullets),
              ),
            );
          }

          if (item.nestedBullets) {
            elements.push(
              React.createElement(
                "div",
                { key: `nested-${idx}` },
                renderNestedBullets(item.nestedBullets),
              ),
            );
          }

          return React.createElement("div", { key: idx }, elements);
        }),
      ]),
      // Footer
      slide.source &&
        React.createElement(
          "footer",
          { key: "footer", className: "slide-footer" },
          [
            React.createElement(
              "span",
              { key: "source", className: "footer-text" },
              `Fonte: ${slide.source}`,
            ),
            slide.label &&
              React.createElement(
                "span",
                { key: "label", className: "footer-label" },
                slide.label,
              ),
            React.createElement("div", { key: "dot", className: "footer-dot" }),
          ],
        ),
    ],
  );
}

/**
 * Stats Slide with large numbers
 */
function StatsSlide({ slide }) {
  const items = slide.items || [];

  return React.createElement(
    "div",
    {
      className: "slide slide--content slide--stats",
      style: { opacity: 1 },
    },
    [
      // Header
      React.createElement(
        "header",
        { key: "header", className: "slide-header" },
        React.createElement(CognaLogo, { size: "small" }),
      ),
      // Title
      slide.tag &&
        React.createElement(
          "span",
          {
            key: "tag",
            style: {
              fontSize: "12px",
              fontWeight: 500,
              color: "#9CA3AF",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "8px",
            },
          },
          slide.tag,
        ),
      React.createElement(
        "h1",
        { key: "title", className: "slide-title" },
        slide.title,
      ),
      // Stats grid
      React.createElement(
        "div",
        { key: "grid", className: "stats-grid" },
        items.map((item, idx) =>
          React.createElement("div", { key: idx, className: "stat-item" }, [
            React.createElement(
              "div",
              { key: "value", className: "stat-value" },
              item.value,
            ),
            React.createElement(
              "div",
              { key: "label", className: "stat-label" },
              item.label,
            ),
          ]),
        ),
      ),
    ],
  );
}

/**
 * Two Column Slide
 */
function TwoColumnSlide({ slide }) {
  const items = slide.items || [];
  const leftItem = items[0];
  const rightItem = items[1];

  const renderColumn = (item) => {
    if (!item) return null;

    return React.createElement("div", { className: "column" }, [
      item.title &&
        React.createElement(
          "h3",
          {
            key: "title",
            className: "column-title",
          },
          item.title,
        ),
      item.bullets &&
        React.createElement(
          "ul",
          {
            key: "bullets",
            className: "bullet-list",
          },
          item.bullets.map((bullet, idx) =>
            React.createElement(
              "li",
              { key: idx },
              bullet.highlight
                ? React.createElement(
                    "span",
                    { className: "text-bold" },
                    bullet.text,
                  )
                : bullet.text,
            ),
          ),
        ),
    ]);
  };

  return React.createElement(
    "div",
    {
      className: "slide slide--content slide--two-column",
      style: { opacity: 1 },
    },
    [
      // Header
      React.createElement(
        "header",
        { key: "header", className: "slide-header" },
        React.createElement(CognaLogo, { size: "small" }),
      ),
      // Body
      React.createElement("main", { key: "body", className: "slide-body" }, [
        slide.tag &&
          React.createElement(
            "span",
            {
              key: "tag",
              style: {
                fontSize: "12px",
                fontWeight: 500,
                color: "#9CA3AF",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "8px",
                display: "block",
              },
            },
            slide.tag,
          ),
        React.createElement(
          "h1",
          { key: "title", className: "slide-title" },
          slide.title,
        ),
        React.createElement("div", { key: "columns", className: "columns" }, [
          React.createElement("div", { key: "left" }, renderColumn(leftItem)),
          React.createElement("div", { key: "right" }, renderColumn(rightItem)),
        ]),
      ]),
    ],
  );
}

/**
 * List Slide with 2x2 grid
 */
function ListSlide({ slide }) {
  const items = slide.items || [];

  return React.createElement(
    "div",
    {
      className: "slide slide--content slide--list",
      style: { opacity: 1 },
    },
    [
      // Header
      React.createElement(
        "header",
        { key: "header", className: "slide-header" },
        React.createElement(CognaLogo, { size: "small" }),
      ),
      // Body
      React.createElement("main", { key: "body", className: "slide-body" }, [
        slide.tag &&
          React.createElement(
            "span",
            {
              key: "tag",
              style: {
                fontSize: "12px",
                fontWeight: 500,
                color: "#9CA3AF",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "8px",
                display: "block",
              },
            },
            slide.tag,
          ),
        React.createElement(
          "h1",
          { key: "title", className: "slide-title" },
          slide.title,
        ),
        slide.subtitle &&
          React.createElement(
            "p",
            {
              key: "subtitle",
              style: {
                fontSize: "16px",
                color: "#6B7280",
                marginBottom: "16px",
              },
            },
            slide.subtitle,
          ),
        React.createElement(
          "div",
          { key: "grid", className: "list-grid" },
          items.map((item, idx) =>
            React.createElement("div", { key: idx, className: "list-item" }, [
              React.createElement("div", {
                key: "dot",
                className: "list-item-dot",
              }),
              React.createElement(
                "div",
                { key: "content", className: "list-item-content" },
                [
                  React.createElement("h4", { key: "title" }, item.title),
                  item.subtitle &&
                    React.createElement("p", { key: "sub" }, item.subtitle),
                ],
              ),
            ]),
          ),
        ),
      ]),
    ],
  );
}

/**
 * Comparison Box Component (for content slides)
 */
function ComparisonBox({ columns }) {
  return React.createElement(
    "div",
    { className: "comparison-box" },
    columns.map((col, idx) => {
      // Check if this is an operator
      if (col.operator) {
        return React.createElement(
          "div",
          {
            key: idx,
            className: "comparison-box__operator",
          },
          col.operator,
        );
      }

      return React.createElement(
        "div",
        {
          key: idx,
          className: "comparison-box__column",
        },
        [
          React.createElement(
            "h4",
            {
              key: "title",
              className: "comparison-box__title",
            },
            col.title,
          ),
          col.items &&
            React.createElement(
              "ul",
              {
                key: "list",
                className: "comparison-box__list",
              },
              col.items.map((item, i) =>
                React.createElement("li", { key: i }, item),
              ),
            ),
          col.note &&
            React.createElement(
              "span",
              {
                key: "note",
                className: "comparison-box__note",
              },
              col.note,
            ),
        ],
      );
    }),
  );
}

/**
 * Main Presentation Component
 */
function Presentation({ slides, title, subtitle }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);

  // Calculate scale to fit viewport
  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const scaleX = container.clientWidth / BASE_WIDTH;
      const scaleY = container.clientHeight / BASE_HEIGHT;
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

      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        goToSlide(Math.min(currentSlide + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goToSlide(Math.max(currentSlide - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        goToSlide(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goToSlide(slides.length - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, isAnimating, slides.length]);

  const goToSlide = (index) => {
    if (index === currentSlide || isAnimating) return;
    setIsAnimating(true);
    setCurrentSlide(index);
    setTimeout(() => setIsAnimating(false), 500);
  };

  const renderSlide = (slide, index) => {
    const isActive = index === currentSlide;

    if (!isActive) return null;

    const slideStyle = {
      transform: `scale(${scale})`,
      opacity: 1,
    };

    let SlideComponent;
    switch (slide.layout) {
      case "title":
        SlideComponent = TitleSlide;
        break;
      case "stats":
        SlideComponent = StatsSlide;
        break;
      case "two-column":
        SlideComponent = TwoColumnSlide;
        break;
      case "list":
        SlideComponent = ListSlide;
        break;
      case "content":
      default:
        SlideComponent = ContentSlide;
        break;
    }

    return React.createElement(
      "div",
      {
        key: slide.id,
        style: slideStyle,
      },
      React.createElement(SlideComponent, { slide }),
    );
  };

  return React.createElement(
    "div",
    {
      ref: containerRef,
      className: "presentation-container",
    },
    [
      // Slides
      ...slides.map(renderSlide),

      // Navigation controls
      React.createElement("div", { key: "nav", className: "nav-controls" }, [
        // Slide indicator
        React.createElement(
          "span",
          { key: "indicator", className: "nav-indicator" },
          `${String(currentSlide + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`,
        ),
        // First slide button
        React.createElement(
          "button",
          {
            key: "first",
            className: "nav-btn",
            onClick: () => goToSlide(0),
            disabled: currentSlide === 0 || isAnimating,
            title: "First slide",
          },
          "⏮",
        ),
        // Previous button
        React.createElement(
          "button",
          {
            key: "prev",
            className: "nav-btn",
            onClick: () => goToSlide(currentSlide - 1),
            disabled: currentSlide === 0 || isAnimating,
            title: "Previous slide",
          },
          "←",
        ),
        // Next button
        React.createElement(
          "button",
          {
            key: "next",
            className: "nav-btn nav-btn--primary",
            onClick: () => goToSlide(currentSlide + 1),
            disabled: currentSlide === slides.length - 1 || isAnimating,
            title: "Next slide",
          },
          "→",
        ),
        // Fullscreen button
        React.createElement(
          "button",
          {
            key: "fs",
            className: "nav-btn",
            onClick: () => {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                document.documentElement.requestFullscreen();
              }
            },
            title: "Toggle fullscreen",
          },
          "⛶",
        ),
      ]),
    ],
  );
}

/**
 * Initialize presentation from manifest
 */
async function initPresentation(manifestPath = "./slides/manifest.json") {
  try {
    const response = await fetch(manifestPath);
    const manifest = await response.json();

    // Load all slides
    const slides = await Promise.all(
      manifest.slides.map(async (slideInfo) => {
        try {
          const slideResponse = await fetch(`./slides/${slideInfo.file}`);
          const slideData = await slideResponse.json();
          return { ...slideInfo, ...slideData };
        } catch (e) {
          console.error(`Failed to load slide: ${slideInfo.file}`, e);
          return slideInfo;
        }
      }),
    );

    // Render presentation
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(
      React.createElement(Presentation, {
        slides,
        title: manifest.title || "Presentation",
        subtitle: manifest.subtitle || "",
      }),
    );
  } catch (e) {
    console.error("Failed to initialize presentation:", e);
    document.getElementById("root").innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; color: #8B5CF6; font-family: Inter, sans-serif;">
        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 16px;">Presentation not found</h1>
        <p style="font-size: 16px; color: #6B7280;">
          Create a manifest.json in the slides directory to get started.
        </p>
      </div>
    `;
  }
}

// Export for global access
window.Presentation = Presentation;
window.initPresentation = initPresentation;
window.CognaLogo = CognaLogo;
window.ComparisonBox = ComparisonBox;

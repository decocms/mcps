/**
 * Slides Presentation Engine
 * Adapted from deco.cx Investor Updates presentation
 * Works with CDN-loaded React and GSAP - no build required
 */

// Base dimensions (16:9 aspect ratio)
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

// Color system
const colors = {
  // Background colors
  bg: {
    "dc-950": "#0f0e0d",
    "dc-900": "#1a1918",
    "dc-800": "#2a2927",
    "primary-light": "#c4df1b",
    "purple-light": "#d4a5ff",
    "yellow-light": "#ffd666",
  },
  // Text colors
  text: {
    "dc-50": "#faf9f7",
    "dc-100": "#f0eeeb",
    "dc-200": "#e1ddd8",
    "dc-300": "#c9c4bc",
    "dc-400": "#a39d94",
    "dc-500": "#6d6a66",
    "dc-600": "#52504c",
    "dc-700": "#3a3936",
    "dc-800": "#2a2927",
    "dc-900": "#1a1918",
  },
  // Accent colors
  accent: {
    green: "#c4df1b",
    purple: "#d4a5ff",
    yellow: "#ffd666",
  },
};

// CSS class mappings
const bgColorMap = {
  "dc-950": "bg-dc-950",
  "dc-900": "bg-dc-900",
  "dc-800": "bg-dc-800",
  "primary-light": "bg-primary-light",
  "purple-light": "bg-purple-light",
  "yellow-light": "bg-yellow-light",
};

const accentTextClass = {
  green: "text-accent-green",
  purple: "text-accent-purple",
  yellow: "text-accent-yellow",
};

const accentBgClass = {
  green: "bg-accent-green",
  purple: "bg-accent-purple",
  yellow: "bg-accent-yellow",
};

/**
 * Main Presentation Component
 */
function Presentation({ slides, title, subtitle, styleGuide }) {
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const [isAnimating, setIsAnimating] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const containerRef = React.useRef(null);
  const slideRefs = React.useRef([]);

  const totalSlides = slides.length + 1; // +1 for cover slide

  // Calculate scale based on viewport
  React.useEffect(() => {
    const updateScale = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scaleX = vw / BASE_WIDTH;
      const scaleY = vh / BASE_HEIGHT;
      setScale(Math.min(scaleX, scaleY));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (isAnimating) return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
          e.preventDefault();
          goToNextSlide();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          goToPrevSlide();
          break;
        case "Home":
          e.preventDefault();
          goToSlide(0);
          break;
        case "End":
          e.preventDefault();
          goToSlide(totalSlides - 1);
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnimating, currentSlide, totalSlides]);

  // GSAP slide transition
  const animateSlideTransition = async (fromIndex, toIndex) => {
    if (typeof gsap === "undefined") {
      setCurrentSlide(toIndex);
      return;
    }

    setIsAnimating(true);

    // Animate out current slide
    const currentEl = slideRefs.current[fromIndex];
    if (currentEl) {
      const items = currentEl.querySelectorAll(".animate-item");
      await gsap.to(items, {
        y: -20,
        opacity: 0,
        duration: 0.2,
        stagger: 0.02,
        ease: "power2.in",
      });
    }

    // Update slide
    setCurrentSlide(toIndex);

    // Wait for React to render
    await new Promise((r) => setTimeout(r, 50));

    // Animate in new slide
    const newEl = slideRefs.current[toIndex];
    if (newEl) {
      const items = newEl.querySelectorAll(".animate-item");
      gsap.set(items, { y: 40, opacity: 0 });
      await gsap.to(items, {
        y: 0,
        opacity: 1,
        duration: 0.4,
        stagger: 0.05,
        ease: "power2.out",
      });
    }

    setIsAnimating(false);
  };

  const goToSlide = (index) => {
    if (
      isAnimating ||
      index === currentSlide ||
      index < 0 ||
      index >= totalSlides
    )
      return;
    animateSlideTransition(currentSlide, index);
  };

  const goToNextSlide = () => {
    if (currentSlide < totalSlides - 1) {
      goToSlide(currentSlide + 1);
    }
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Touch gesture handling
  const touchStartRef = React.useRef({ x: 0, y: 0 });

  const handleTouchStart = (e) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e) => {
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX < 0) {
        goToNextSlide();
      } else {
        goToPrevSlide();
      }
    }
  };

  // Render slide content based on layout
  const renderSlideContent = (slide, index, isActive) => {
    const bgClass =
      bgColorMap[slide.backgroundColor || "dc-950"] || "bg-dc-950";
    const textColorClass =
      slide.textColor === "dark" ? "text-dc-900" : "text-dc-50";
    const accent = slide.accent || "green";

    switch (slide.layout) {
      case "title":
        return renderTitleSlide(slide, bgClass, textColorClass, accent);
      case "content":
        return renderContentSlide(slide, bgClass, textColorClass, accent);
      case "two-column":
        return renderTwoColumnSlide(slide, bgClass, textColorClass, accent);
      case "stats":
        return renderStatsSlide(
          slide,
          bgClass,
          textColorClass,
          accent,
          isActive,
        );
      case "list":
        return renderListSlide(slide, bgClass, textColorClass, accent);
      case "image":
        return renderImageSlide(slide, bgClass, textColorClass, accent);
      case "quote":
        return renderQuoteSlide(slide, bgClass, textColorClass, accent);
      case "custom":
        return renderCustomSlide(slide, bgClass, textColorClass);
      default:
        return renderTitleSlide(slide, bgClass, textColorClass, accent);
    }
  };

  // Title slide layout
  const renderTitleSlide = (slide, bgClass, textColorClass, accent) =>
    React.createElement(
      "div",
      {
        className: `w-full h-full flex flex-col ${bgClass} ${textColorClass}`,
        style: { padding: "64px 80px" },
      },
      slide.tag &&
        React.createElement(
          "span",
          {
            className:
              "animate-item font-mono uppercase tracking-widest opacity-50",
            style: {
              fontSize: "11px",
              marginBottom: "16px",
              letterSpacing: "0.2em",
            },
          },
          slide.tag,
        ),
      React.createElement(
        "div",
        { className: "flex-1 flex flex-col justify-end" },
        React.createElement(
          "h1",
          {
            className: "animate-item leading-none",
            style: { fontSize: "180px", letterSpacing: "-4px" },
          },
          slide.title,
        ),
        slide.subtitle &&
          React.createElement(
            "p",
            {
              className: "animate-item opacity-50",
              style: { fontSize: "24px", marginTop: "24px" },
            },
            slide.subtitle,
          ),
      ),
    );

  // Content slide layout
  const renderContentSlide = (slide, bgClass, textColorClass, accent) =>
    React.createElement(
      "div",
      {
        className: `w-full h-full flex flex-col ${bgClass} ${textColorClass}`,
        style: { padding: "80px 96px" },
      },
      React.createElement(
        "div",
        { style: { marginBottom: "72px" } },
        slide.tag &&
          React.createElement(
            "span",
            {
              className:
                "animate-item font-mono uppercase tracking-widest text-dc-500",
              style: {
                fontSize: "12px",
                marginBottom: "16px",
                display: "block",
                letterSpacing: "0.2em",
              },
            },
            slide.tag,
          ),
        React.createElement(
          "h2",
          {
            className: "animate-item text-dc-200",
            style: {
              fontSize: "32px",
              letterSpacing: "-0.5px",
              lineHeight: 1.2,
            },
          },
          slide.title,
        ),
      ),
      slide.items &&
        React.createElement(
          "div",
          {
            className: "flex-1 flex flex-col",
            style: { gap: "48px" },
          },
          slide.items.map((item, i) =>
            React.createElement(
              "div",
              { key: i, className: "animate-item" },
              item.title &&
                React.createElement(
                  "h3",
                  {
                    className: "text-dc-300",
                    style: { fontSize: "18px", marginBottom: "20px" },
                  },
                  item.title,
                ),
              item.bullets &&
                React.createElement(
                  "ul",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    },
                  },
                  item.bullets.map((bullet, j) =>
                    React.createElement(
                      "li",
                      {
                        key: j,
                        className: "flex items-start",
                        style: {
                          fontSize: "17px",
                          gap: "16px",
                          lineHeight: 1.5,
                        },
                      },
                      React.createElement(
                        "span",
                        {
                          className: accentTextClass[accent],
                          style: { marginTop: "6px", fontSize: "8px" },
                        },
                        "●",
                      ),
                      React.createElement(
                        "span",
                        {
                          className: bullet.highlight
                            ? accentTextClass[accent]
                            : "text-dc-300",
                        },
                        bullet.text,
                      ),
                    ),
                  ),
                ),
            ),
          ),
        ),
    );

  // Two-column slide layout
  const renderTwoColumnSlide = (slide, bgClass, textColorClass, accent) =>
    React.createElement(
      "div",
      {
        className: `w-full h-full flex flex-col ${bgClass} ${textColorClass}`,
        style: { padding: "80px 96px" },
      },
      React.createElement(
        "div",
        { style: { marginBottom: "72px" } },
        slide.tag &&
          React.createElement(
            "span",
            {
              className:
                "animate-item font-mono uppercase tracking-widest text-dc-500",
              style: {
                fontSize: "12px",
                marginBottom: "16px",
                display: "block",
                letterSpacing: "0.2em",
              },
            },
            slide.tag,
          ),
        React.createElement(
          "h2",
          {
            className: "animate-item text-dc-200",
            style: {
              fontSize: "32px",
              letterSpacing: "-0.5px",
              lineHeight: 1.2,
            },
          },
          slide.title,
        ),
        slide.subtitle &&
          React.createElement(
            "p",
            {
              className: "animate-item text-dc-400",
              style: { fontSize: "17px", marginTop: "16px" },
            },
            slide.subtitle,
          ),
      ),
      slide.items &&
        React.createElement(
          "div",
          {
            className: "flex-1 grid",
            style: { gridTemplateColumns: "1fr 1fr", gap: "80px" },
          },
          slide.items.map((item, i) =>
            React.createElement(
              "div",
              { key: i, className: "animate-item" },
              item.title &&
                React.createElement(
                  "h3",
                  {
                    className: accentTextClass[accent],
                    style: { fontSize: "18px", marginBottom: "24px" },
                  },
                  item.title,
                ),
              item.bullets &&
                React.createElement(
                  "ul",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                    },
                  },
                  item.bullets.map((bullet, j) =>
                    React.createElement(
                      "li",
                      {
                        key: j,
                        className: bullet.highlight
                          ? accentTextClass[accent]
                          : "text-dc-400",
                        style: { fontSize: "15px", lineHeight: 1.5 },
                      },
                      bullet.text,
                    ),
                  ),
                ),
            ),
          ),
        ),
    );

  // Stats slide layout with count-up animation
  const renderStatsSlide = (slide, bgClass, textColorClass, accent, isActive) =>
    React.createElement(
      "div",
      {
        className: `w-full h-full flex flex-col ${bgClass} ${textColorClass}`,
        style: { padding: "80px 96px" },
      },
      React.createElement(
        "div",
        { style: { marginBottom: "80px" } },
        slide.tag &&
          React.createElement(
            "span",
            {
              className:
                "animate-item font-mono uppercase tracking-widest text-dc-500",
              style: {
                fontSize: "12px",
                marginBottom: "16px",
                display: "block",
                letterSpacing: "0.2em",
              },
            },
            slide.tag,
          ),
        React.createElement(
          "h2",
          {
            className: "animate-item text-dc-200",
            style: {
              fontSize: "32px",
              letterSpacing: "-0.5px",
              lineHeight: 1.2,
            },
          },
          slide.title,
        ),
      ),
      slide.items &&
        React.createElement(
          "div",
          {
            className: "flex-1 grid items-center",
            style: {
              gridTemplateColumns: `repeat(${Math.min(slide.items.length, 4)}, 1fr)`,
              gap: "64px",
            },
          },
          slide.items.map((item, i) =>
            React.createElement(
              "div",
              { key: i, className: "animate-item text-center" },
              item.value &&
                React.createElement(CountUp, {
                  end: parseInt(item.value.replace(/[^0-9]/g, "")) || 0,
                  prefix: item.value.match(/^[^0-9]*/)?.[0] || "",
                  suffix: item.value.match(/[^0-9]*$/)?.[0] || "",
                  isActive: isActive,
                  className: `block ${accentTextClass[accent]}`,
                  style: {
                    fontSize: "56px",
                    marginBottom: "16px",
                    letterSpacing: "-1px",
                  },
                }),
              item.label &&
                React.createElement(
                  "span",
                  {
                    className: "text-dc-400",
                    style: { fontSize: "16px" },
                  },
                  item.label,
                ),
            ),
          ),
        ),
    );

  // List slide layout
  const renderListSlide = (slide, bgClass, textColorClass, accent) =>
    React.createElement(
      "div",
      {
        className: `w-full h-full flex flex-col ${bgClass} ${textColorClass}`,
        style: { padding: "80px 96px" },
      },
      React.createElement(
        "div",
        { style: { marginBottom: "72px" } },
        slide.tag &&
          React.createElement(
            "span",
            {
              className:
                "animate-item font-mono uppercase tracking-widest text-dc-500",
              style: {
                fontSize: "12px",
                marginBottom: "16px",
                display: "block",
                letterSpacing: "0.2em",
              },
            },
            slide.tag,
          ),
        React.createElement(
          "h2",
          {
            className: "animate-item text-dc-200",
            style: {
              fontSize: "32px",
              letterSpacing: "-0.5px",
              lineHeight: 1.2,
            },
          },
          slide.title,
        ),
        slide.subtitle &&
          React.createElement(
            "p",
            {
              className: "animate-item text-dc-400",
              style: { fontSize: "17px", marginTop: "16px", maxWidth: "800px" },
            },
            slide.subtitle,
          ),
      ),
      slide.items &&
        React.createElement(
          "div",
          {
            className: "flex-1 grid",
            style: {
              gridTemplateColumns: "1fr 1fr",
              columnGap: "80px",
              rowGap: "40px",
            },
          },
          slide.items.map((item, i) =>
            React.createElement(
              "div",
              {
                key: i,
                className: "animate-item flex items-start",
                style: { gap: "20px" },
              },
              React.createElement("div", {
                className: accentBgClass[accent],
                style: {
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  marginTop: "8px",
                  flexShrink: 0,
                },
              }),
              React.createElement(
                "div",
                null,
                item.title &&
                  React.createElement(
                    "span",
                    {
                      className: "text-dc-100 block",
                      style: { fontSize: "17px", lineHeight: 1.5 },
                    },
                    item.title,
                  ),
                item.subtitle &&
                  React.createElement(
                    "span",
                    {
                      className: "text-dc-500 block",
                      style: { fontSize: "15px", marginTop: "6px" },
                    },
                    item.subtitle,
                  ),
              ),
            ),
          ),
        ),
    );

  // Image slide layout
  const renderImageSlide = (slide, bgClass, textColorClass, accent) =>
    React.createElement(
      "div",
      {
        className: `w-full h-full relative ${bgClass} ${textColorClass}`,
        style: { overflow: "hidden" },
      },
      slide.backgroundImage &&
        React.createElement("img", {
          src: slide.backgroundImage,
          alt: "",
          style: {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          },
        }),
      React.createElement("div", {
        style: {
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(15,14,13,0.9) 0%, rgba(15,14,13,0.3) 50%, transparent 100%)",
        },
      }),
      React.createElement(
        "div",
        {
          className: "absolute bottom-0 left-0 right-0",
          style: { padding: "80px 96px" },
        },
        slide.tag &&
          React.createElement(
            "span",
            {
              className:
                "animate-item font-mono uppercase tracking-widest text-dc-400",
              style: {
                fontSize: "12px",
                marginBottom: "16px",
                display: "block",
                letterSpacing: "0.2em",
              },
            },
            slide.tag,
          ),
        React.createElement(
          "h2",
          {
            className: "animate-item text-dc-50",
            style: {
              fontSize: "48px",
              letterSpacing: "-1px",
              lineHeight: 1.2,
              maxWidth: "900px",
            },
          },
          slide.title,
        ),
        slide.subtitle &&
          React.createElement(
            "p",
            {
              className: "animate-item text-dc-300",
              style: { fontSize: "20px", marginTop: "24px", maxWidth: "700px" },
            },
            slide.subtitle,
          ),
      ),
    );

  // Quote slide layout
  const renderQuoteSlide = (slide, bgClass, textColorClass, accent) =>
    React.createElement(
      "div",
      {
        className: `w-full h-full flex flex-col items-center justify-center ${bgClass} ${textColorClass}`,
        style: { padding: "96px" },
      },
      React.createElement(
        "blockquote",
        {
          className: "animate-item text-center",
          style: { maxWidth: "1200px" },
        },
        React.createElement(
          "span",
          {
            className: accentTextClass[accent],
            style: {
              fontSize: "120px",
              lineHeight: 0.5,
              display: "block",
              marginBottom: "24px",
            },
          },
          '"',
        ),
        React.createElement(
          "p",
          {
            style: {
              fontSize: "42px",
              lineHeight: 1.4,
              letterSpacing: "-0.5px",
            },
          },
          slide.title,
        ),
        slide.subtitle &&
          React.createElement(
            "cite",
            {
              className: "text-dc-400 block not-italic",
              style: { fontSize: "18px", marginTop: "48px" },
            },
            "— ",
            slide.subtitle,
          ),
      ),
    );

  // Custom HTML slide layout
  const renderCustomSlide = (slide, bgClass, textColorClass) =>
    React.createElement("div", {
      className: `w-full h-full ${bgClass} ${textColorClass}`,
      dangerouslySetInnerHTML: { __html: slide.customHtml || "" },
    });

  // Cover slide
  const renderCoverSlide = () =>
    React.createElement(
      "div",
      {
        className:
          "w-full h-full flex flex-col justify-between bg-dc-950 text-dc-50",
        style: { padding: "90px 82px" },
      },
      React.createElement(
        "div",
        null,
        React.createElement(
          "div",
          {
            className: "animate-item",
            style: { fontSize: "32px", fontWeight: 600 },
          },
          "◆",
        ),
      ),
      React.createElement(
        "div",
        {
          className: "flex flex-col",
          style: { gap: "22px", maxWidth: "1175px" },
        },
        subtitle &&
          React.createElement(
            "p",
            {
              className: "animate-item font-mono uppercase text-dc-400",
              style: { fontSize: "24px", letterSpacing: "1.2px" },
            },
            subtitle,
          ),
        React.createElement(
          "h1",
          {
            className: "animate-item text-dc-50 leading-none",
            style: { fontSize: "140px", letterSpacing: "-2.8px" },
          },
          title || "Presentation",
        ),
      ),
    );

  // Calculate display dimensions
  const displayWidth = BASE_WIDTH * scale;
  const displayHeight = BASE_HEIGHT * scale;

  return React.createElement(
    "div",
    {
      ref: containerRef,
      className: "fixed inset-0 w-screen h-screen bg-dc-950 overflow-hidden",
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
    },
    // Hide animate-item elements initially
    React.createElement(
      "style",
      null,
      `
      .animate-item {
        opacity: 0;
        transform: translateY(40px);
      }
    `,
    ),

    // Centered container for scaled presentation
    React.createElement(
      "div",
      {
        className: "absolute inset-0 flex items-center justify-center",
      },
      React.createElement(
        "div",
        {
          style: {
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            position: "relative",
            overflow: "hidden",
          },
        },
        // Scaled presentation container
        React.createElement(
          "div",
          {
            style: {
              width: `${BASE_WIDTH}px`,
              height: `${BASE_HEIGHT}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            },
          },
          // Cover slide
          React.createElement(
            "div",
            {
              ref: (el) => (slideRefs.current[0] = el),
              className: `absolute inset-0 transition-opacity duration-300 ${
                currentSlide === 0
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none"
              }`,
            },
            renderCoverSlide(),
          ),

          // Content slides
          slides.map((slide, index) =>
            React.createElement(
              "div",
              {
                key: index,
                ref: (el) => (slideRefs.current[index + 1] = el),
                className: `absolute inset-0 transition-opacity duration-300 ${
                  currentSlide === index + 1
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`,
              },
              renderSlideContent(slide, index, currentSlide === index + 1),
            ),
          ),

          // Navigation controls
          React.createElement(
            "div",
            {
              className: "absolute flex items-center z-50",
              style: { bottom: "40px", right: "48px", gap: "12px" },
            },
            // Slide counter
            React.createElement(
              "span",
              {
                className: "text-dc-600 font-mono",
                style: { fontSize: "12px", marginRight: "12px" },
              },
              `${String(currentSlide + 1).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`,
            ),

            // First button
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => goToSlide(0),
                disabled: currentSlide === 0 || isAnimating,
                className: `rounded-full flex items-center justify-center transition-all border ${
                  currentSlide === 0
                    ? "border-dc-800 text-dc-700 cursor-not-allowed"
                    : "border-dc-700 hover:border-dc-600 text-dc-400 hover:text-dc-300 cursor-pointer"
                }`,
                style: { width: "36px", height: "36px" },
              },
              "⏮",
            ),

            // Previous button
            React.createElement(
              "button",
              {
                type: "button",
                onClick: goToPrevSlide,
                disabled: currentSlide === 0 || isAnimating,
                className: `rounded-full flex items-center justify-center transition-all border ${
                  currentSlide === 0
                    ? "border-dc-800 text-dc-700 cursor-not-allowed"
                    : "border-dc-700 hover:border-dc-600 text-dc-400 hover:text-dc-300 cursor-pointer"
                }`,
                style: { width: "36px", height: "36px" },
              },
              "←",
            ),

            // Next button
            React.createElement(
              "button",
              {
                type: "button",
                onClick: goToNextSlide,
                disabled: currentSlide === totalSlides - 1 || isAnimating,
                className: `rounded-full flex items-center justify-center transition-all ${
                  currentSlide === totalSlides - 1
                    ? "border border-dc-800 text-dc-700 cursor-not-allowed"
                    : "bg-primary-light/10 border border-primary-light/30 hover:bg-primary-light/20 text-primary-light cursor-pointer"
                }`,
                style: { width: "36px", height: "36px" },
              },
              "→",
            ),

            // Fullscreen button
            React.createElement(
              "button",
              {
                type: "button",
                onClick: toggleFullscreen,
                className:
                  "rounded-full flex items-center justify-center transition-all border border-dc-700 hover:border-dc-600 text-dc-400 hover:text-dc-300 cursor-pointer",
                style: { width: "36px", height: "36px", marginLeft: "8px" },
                title: isFullscreen ? "Exit fullscreen" : "Enter fullscreen",
              },
              isFullscreen ? "⛶" : "⛶",
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * CountUp Component for stats animation
 */
function CountUp({
  end,
  prefix = "",
  suffix = "",
  duration = 2000,
  className = "",
  style = {},
  isActive = false,
}) {
  const [count, setCount] = React.useState(0);
  const hasAnimatedRef = React.useRef(false);

  React.useEffect(() => {
    if (isActive && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.floor(eased * end));

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setCount(end);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [isActive, end, duration]);

  // Reset when becoming inactive
  React.useEffect(() => {
    if (!isActive) {
      hasAnimatedRef.current = false;
      setCount(0);
    }
  }, [isActive]);

  return React.createElement(
    "span",
    { className, style },
    prefix,
    count.toLocaleString(),
    suffix,
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
        styleGuide: manifest.styleGuide || "",
      }),
    );
  } catch (e) {
    console.error("Failed to initialize presentation:", e);
    document.getElementById("root").innerHTML = `
      <div style="color: #c4df1b; padding: 48px; font-family: system-ui;">
        <h1>Presentation not found</h1>
        <p style="color: #a39d94; margin-top: 16px;">
          Create a manifest.json in the slides directory to get started.
        </p>
      </div>
    `;
  }
}

// Export for use in HTML
window.Presentation = Presentation;
window.CountUp = CountUp;
window.initPresentation = initPresentation;

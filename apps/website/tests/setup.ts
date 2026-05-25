/// <reference types="vite-plus/test/browser/context" />

// Disable CSS animations/transitions in the test iframe so Playwright's
// "stable" actionability check fires immediately.
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;
document.head.appendChild(style);

export {};

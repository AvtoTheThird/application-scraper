module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "cs-orange": "#FF6B35",
        "cs-dark": "#1a1a2e",
        "cs-darker": "#0f0f1e",
      },
    },
  },
  plugins: [],
};

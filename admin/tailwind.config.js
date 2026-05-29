/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Paper Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas'],
      },
      colors: {
        // Brand
        primary: '#056dff', // CF Blue
        orange: '#f6821f', // CF Orange

        // Semantic Colors (mapped to CSS variables)
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        card: 'var(--bg-card)',
        hover: 'var(--bg-hover)',

        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          subtle: 'var(--text-subtle)',
          inactive: 'var(--text-inactive)',
          inverse: 'var(--text-inverse)',
        },

        border: 'var(--border-color)',
        divider: 'var(--divider-color)',

        input: {
          bg: 'var(--input-bg)',
          border: 'var(--input-border)',
          focus: 'var(--input-focus)',
        },

        // Status Colors
        success: {
          DEFAULT: 'var(--color-success)',
          bg: 'var(--color-success-bg)',
          text: 'var(--color-success-text)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          bg: 'var(--color-warning-bg)',
          text: 'var(--color-warning-text)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          bg: 'var(--color-danger-bg)',
          text: 'var(--color-danger-text)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          bg: 'var(--color-info-bg)',
          text: 'var(--color-info-text)',
        },

        table: {
          header: 'var(--table-header-bg)',
          divider: 'var(--table-divider)',
          'row-hover': 'var(--table-row-hover)',
        },

        // Backward compatibility / specific overrides
        admin: {
          bg: 'var(--bg-page)',
          sidebar: 'var(--bg-page)',
          sidebarHover: 'var(--bg-hover)',
          header: 'var(--bg-page)',
          border: 'var(--border-color)',
        }
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'dropdown': 'var(--shadow-dropdown)',
      },
      borderRadius: {
        DEFAULT: '4px',
        'md': '6px',
        'lg': '8px',
      }
    },
  },
  plugins: [],
}

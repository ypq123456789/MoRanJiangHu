const withOpacity = (variableName) => ({ opacityValue }) => {
  if (opacityValue !== undefined) {
    return `rgb(var(${variableName}) / ${opacityValue})`;
  }
  return `rgb(var(${variableName}))`;
};

module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'ink-black': withOpacity('--c-ink-black'),
        'ink-gray': withOpacity('--c-ink-gray'),
        'wuxia-gold': withOpacity('--c-wuxia-gold'),
        'wuxia-gold-dark': withOpacity('--c-wuxia-gold-dark'),
        'wuxia-cyan': withOpacity('--c-wuxia-cyan'),
        'wuxia-red': withOpacity('--c-wuxia-red'),
        'paper-white': withOpacity('--c-paper-white')
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', 'SimSun', 'Songti SC', 'serif'],
        sans: ['"Noto Sans SC"', 'Microsoft YaHei', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace']
      },
      animation: {
        glitch: 'glitch 1s linear infinite',
        'slide-in': 'slideIn 0.3s ease-out forwards',
        fadeIn: 'fadeIn 0.3s ease-out forwards',
        marquee: 'marquee 60s linear infinite',
        'marquee-linear': 'marqueeLinear var(--marquee-duration, 36s) linear infinite',
        'damage-float': 'damageFloat 1.2s ease-out forwards'
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        marquee: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' }
        },
        marqueeLinear: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' }
        },
        damageFloat: {
          '0%': { transform: 'translateY(0) scale(0.8)', opacity: '1' },
          '30%': { transform: 'translateY(-20px) scale(1.2)', opacity: '1' },
          '100%': { transform: 'translateY(-60px) scale(0.9)', opacity: '0' }
        }
      }
    }
  }
};

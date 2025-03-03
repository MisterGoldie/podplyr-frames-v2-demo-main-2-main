/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'float-slow': {
          '0%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-30px) translateX(10px) rotate(8deg)' },
          '66%': { transform: 'translateY(-15px) translateX(-8px) rotate(-4deg)' },
          '100%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
        },
        'float-medium': {
          '0%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-25px) translateX(-12px) rotate(-6deg)' },
          '66%': { transform: 'translateY(-40px) translateX(8px) rotate(4deg)' },
          '100%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
        },
        'float-fast': {
          '0%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-20px) translateX(15px) rotate(5deg)' },
          '66%': { transform: 'translateY(-35px) translateX(-10px) rotate(-8deg)' },
          '100%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
        },
        'float-slower': {
          '0%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-45px) translateX(-15px) rotate(-10deg)' },
          '66%': { transform: 'translateY(-20px) translateX(12px) rotate(6deg)' },
          '100%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
        },
        'float-slowest': {
          '0%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-35px) translateX(18px) rotate(12deg)' },
          '66%': { transform: 'translateY(-50px) translateX(-15px) rotate(-8deg)' },
          '100%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'slide-down': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(100%)', opacity: '0' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' }
        },
        'scale-up': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        'scale-down': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.8)', opacity: '0' }
        }
      },
      animation: {
        'float-slow': 'float-slow 12s ease-in-out infinite',
        'float-medium': 'float-medium 14s ease-in-out infinite',
        'float-fast': 'float-fast 10s ease-in-out infinite',
        'float-slower': 'float-slower 16s ease-in-out infinite',
        'float-slowest': 'float-slowest 18s ease-in-out infinite',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slide-down 0.3s ease-in forwards',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'fade-out': 'fade-out 0.2s ease-in forwards',
        'scale-up': 'scale-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-down': 'scale-down 0.3s ease-in forwards'
      },
    },
  },
  plugins: [],
}

import React from 'react';
import clsx from 'clsx';

const baseStyles =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';

const variants = {
  primary:
    'bg-pink-strong hover:bg-pink-strong/90 text-white focus-visible:ring-pink-medium focus-visible:ring-offset-pale shadow-soft',
  secondary:
    'bg-white text-pink-strong ring-1 ring-inset ring-pink-strong/30 hover:bg-pink-soft/80 focus-visible:ring-pink-strong',
  ghost: 'text-pink-strong hover:bg-pink-soft/60 focus-visible:ring-pink-strong'
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-6 py-3 text-base'
};

export function Button({ as: Component = 'button', variant = 'primary', size = 'md', className, ...props }) {
  return <Component className={clsx(baseStyles, variants[variant], sizes[size], className)} {...props} />;
}

export default Button;

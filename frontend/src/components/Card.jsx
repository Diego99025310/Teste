import React from 'react';
import clsx from 'clsx';

const baseClass = 'bg-white/90 backdrop-blur border border-white/40 rounded-3xl shadow-soft';

export function Card({ as: Component = 'div', className, children, padding = 'p-6 md:p-8', ...props }) {
  return (
    <Component className={clsx(baseClass, padding, className)} {...props}>
      {children}
    </Component>
  );
}

export default Card;

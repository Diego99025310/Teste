import React from 'react';
import { Link } from 'react-router-dom';
import Button from './Button.jsx';

export function Header({ title, subtitle, actions }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-pink-medium/80">HidraPink</p>
        <h1 className="text-3xl font-semibold text-ink md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-pink-medium/80">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/login">
          <Button variant="ghost" size="sm">
            Trocar usuário
          </Button>
        </Link>
        {actions}
      </div>
    </header>
  );
}

export default Header;

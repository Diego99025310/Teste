import React from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

const links = [
  { to: '/dashboard/master', label: 'Painel Master' },
  { to: '/dashboard/influencer', label: 'Painel Influenciadora' },
  { to: '/login', label: 'Login' }
];

export function Sidebar() {
  return (
    <aside className="sticky top-6 flex h-max w-full flex-col gap-3 rounded-3xl bg-white/75 p-6 shadow-soft backdrop-blur md:w-72">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-pink-medium/70">Navegação</p>
        <h2 className="text-xl font-semibold text-ink">Seu universo HidraPink</h2>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              clsx(
                'rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-pink-strong text-white shadow-soft'
                  : 'text-ink/70 hover:bg-pink-soft/60 hover:text-ink'
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="rounded-2xl bg-gradient-to-br from-pink-strong to-pink-medium p-4 text-white shadow-soft">
        <p className="text-sm font-semibold">Meta da semana</p>
        <p className="mt-2 text-sm text-white/80">
          Alcance 100% do plano de postagens para liberar recompensas exclusivas.
        </p>
      </div>
    </aside>
  );
}

export default Sidebar;

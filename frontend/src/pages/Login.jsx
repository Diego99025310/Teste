import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

export function Login() {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-br from-pink-soft via-white to-pink-soft px-4 py-10 text-ink">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:items-center">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-pink-strong shadow-soft backdrop-blur">
            Bem-vinda ao ecossistema HidraPink
          </span>
          <h1 className="text-4xl font-semibold md:text-5xl">
            Potencialize sua jornada com uma plataforma pensada para influenciadoras e masters.
          </h1>
          <p className="text-lg text-ink/70">
            Centralize campanhas, métricas de vendas, scripts e cronogramas em um único lugar. Utilize seu login
            HidraPink para acessar o painel exclusivo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button as={Link} to="/dashboard/master" className="shadow-xl shadow-pink-strong/30">
              Acessar como Master
            </Button>
            <Button as={Link} to="/dashboard/influencer" variant="secondary">
              Acessar como Influenciadora
            </Button>
          </div>
        </div>
        <Card as="form" className="w-full" onSubmit={(event) => event.preventDefault()}>
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">Entrar na plataforma</h2>
              <p className="text-sm text-ink/60">
                Use o email e senha enviados pela equipe HidraPink. Você pode redefinir sua senha após o primeiro acesso.
              </p>
            </div>
            <label className="space-y-2 text-sm font-medium">
              Email
              <input
                className="w-full rounded-2xl border border-pink-soft/70 bg-white/60 px-4 py-3 text-base text-ink shadow-inner focus:border-pink-medium focus:outline-none focus:ring-2 focus:ring-pink-medium/40"
                type="email"
                placeholder="voce@exemplo.com"
                required
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Senha
              <input
                className="w-full rounded-2xl border border-pink-soft/70 bg-white/60 px-4 py-3 text-base text-ink shadow-inner focus:border-pink-medium focus:outline-none focus:ring-2 focus:ring-pink-medium/40"
                type="password"
                placeholder="********"
                required
              />
            </label>
            <Button type="submit" className="w-full justify-center">
              Entrar
            </Button>
            <div className="flex flex-col gap-2 text-sm text-ink/60">
              <button type="button" className="self-start text-pink-strong hover:underline">
                Esqueci minha senha
              </button>
              <p>Primeiro acesso? Utilize a senha provisória enviada no seu email cadastrado.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Login;

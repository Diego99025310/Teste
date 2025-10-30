import React from 'react';
import { initLoginPage } from '../legacy/main.js';
import { useLegacyPage } from '../hooks/useLegacyPage.js';

export default function Login() {
  useLegacyPage({ pageId: 'login', initializer: initLoginPage, title: 'Login | Sistema Influenciadoras' });

  return (
    <div className="container">
      <section className="card">
        <h2>Login Pinklover</h2>
        <form id="loginForm">
          <label>
            Email ou telefone
            <input
              id="loginEmail"
              name="email"
              type="text"
              placeholder="Digite seu email ou telefone"
              required
              autoComplete="username"
            />
          </label>
          <label>
            Senha
            <input
              id="loginPassword"
              name="password"
              type="password"
              placeholder="********"
              required
              minLength={6}
            />
          </label>
          <button type="submit">Entrar</button>
        </form>
        <div id="loginMessage" className="message" aria-live="polite"></div>
      </section>
    </div>
  );
}

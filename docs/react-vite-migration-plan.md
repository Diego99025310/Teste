# Plano de Execução: Migração do Frontend Legacy para React + Tailwind + Vite

Este guia documenta o passo a passo para transformar o frontend atual (HTML/CSS/JS puro) em uma aplicação React estruturada com Vite e TailwindCSS, mantendo todas as rotas, layout e integração com o backend Express + SQLite existente. Cada etapa inclui comandos, trechos de código e referências diretas aos arquivos do repositório para que o processo possa ser reproduzido no VS Code.

---

## Etapa 1 — Preparar o ambiente e instalar dependências

1. Certifique-se de estar na raiz do repositório e instale as dependências do backend e do frontend.

   ```bash
   npm install
   cd frontend && npm install
   ```

2. Garanta que as ferramentas de desenvolvimento estejam acessíveis:
   - Node.js ≥ 18
   - npm ≥ 9
   - Extensão ESLint/Prettier no VS Code (opcional, mas recomendado)

3. Verifique se os scripts existentes na raiz (`package.json`) contemplam os fluxos locais:

   ```json
   {
     "scripts": {
       "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
       "dev:backend": "nodemon backend/server.js",
       "dev:frontend": "cd frontend && npm run dev",
       "build": "cd frontend && npm run build",
       "preview": "cd frontend && npm run preview",
       "start": "node backend/server.js"
     }
   }
   ```

   > Ajustes adicionais serão feitos no backend para servir o build gerado pelo Vite.

---

## Etapa 2 — Estrutura base do projeto React (Vite)

1. Confirme que a pasta `frontend/` possui os diretórios esperados:

   ```bash
   tree -L 2 frontend
   ```

   Estrutura alvo:

   ```
   frontend/
   ├── index.html
   ├── package.json
   ├── public/
   ├── src/
   │   ├── App.jsx
   │   ├── main.jsx
   │   ├── index.css
   │   ├── pages/
   │   ├── components/
   │   └── lib/
   ├── postcss.config.js
   ├── tailwind.config.js
   └── vite.config.js
   ```

2. Caso precise recriar o projeto React do zero, use o template do Vite com React:

   ```bash
   npm create vite@latest frontend -- --template react
   ```

   > **Importante:** como o repositório já possui arquivos React, utilize o comando apenas se for recomeçar do zero. Caso contrário, mantenha a estrutura atual e avance para as próximas etapas.

---

## Etapa 3 — Configuração do Vite com proxy para o backend

1. Ajuste `frontend/vite.config.js` para garantir que qualquer chamada a `/api` seja redirecionada ao backend Express durante o desenvolvimento:

   ```js
   // frontend/vite.config.js
   const { defineConfig } = require('vite');
   const react = require('@vitejs/plugin-react');

   module.exports = defineConfig({
     plugins: [react()],
     server: {
       host: '0.0.0.0',
       proxy: {
         '/api': {
           target: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
           changeOrigin: true,
           secure: false
         }
       }
     },
     build: {
       outDir: 'dist',
       emptyOutDir: true
     }
   });
   ```

2. No arquivo `frontend/index.html`, mantenha o `div#root` e qualquer fonte externa necessária para preservar o visual:

   ```html
   <!-- frontend/index.html -->
   <!DOCTYPE html>
   <html lang="pt-BR">
     <head>
       <meta charset="UTF-8" />
       <link rel="icon" type="image/svg+xml" href="/vite.svg" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <title>HidraPink</title>
       <link rel="preconnect" href="https://fonts.googleapis.com" />
       <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
       <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
     </head>
     <body class="font-outfit">
       <div id="root"></div>
       <script type="module" src="/src/main.jsx"></script>
     </body>
   </html>
   ```

---

## Etapa 4 — Configuração do TailwindCSS

1. Certifique-se de que `tailwindcss`, `postcss` e `autoprefixer` estão instalados no `frontend/package.json` (já presentes no repositório).

2. Valide/ajuste `frontend/tailwind.config.js` para incluir as cores do tema original:

   ```js
   // frontend/tailwind.config.js
   module.exports = {
     content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
     theme: {
       extend: {
         colors: {
           ink: '#2D2636',
           'pink-soft': '#FDE7F0',
           'pink-medium': '#F7ADC8',
           'pink-strong': '#E4447A'
         },
         boxShadow: {
           soft: '0 25px 45px -20px rgba(228, 68, 122, 0.35)'
         }
       }
     },
     plugins: []
   };
   ```

3. Ajuste `frontend/postcss.config.js` para aplicar os plugins do Tailwind:

   ```js
   // frontend/postcss.config.js
   module.exports = {
     plugins: {
       tailwindcss: {},
       autoprefixer: {}
     }
   };
   ```

4. Em `frontend/src/index.css`, importe o Tailwind e defina as classes globais que replicam o estilo atual:

   ```css
   /* frontend/src/index.css */
   @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

   @tailwind base;
   @tailwind components;
   @tailwind utilities;

   :root {
     color-scheme: light;
   }

   body {
     margin: 0;
     min-height: 100vh;
   }

   .font-outfit {
     font-family: 'Outfit', sans-serif;
   }

   .shadow-soft {
     @apply shadow-[0_25px_45px_-20px_rgba(228,68,122,0.35)];
   }
   ```

---

## Etapa 5 — Ponto de entrada do React e roteamento

1. Configure `frontend/src/main.jsx` com o `BrowserRouter`:

   ```jsx
   // frontend/src/main.jsx
   import React from 'react';
   import ReactDOM from 'react-dom/client';
   import { BrowserRouter } from 'react-router-dom';
   import App from './App.jsx';
   import './index.css';

   ReactDOM.createRoot(document.getElementById('root')).render(
     <React.StrictMode>
       <BrowserRouter>
         <App />
       </BrowserRouter>
     </React.StrictMode>
   );
   ```

2. Defina as rotas em `frontend/src/App.jsx`, refletindo o fluxo legado (login → dashboards):

   ```jsx
   // frontend/src/App.jsx
   import React from 'react';
   import { Navigate, Route, Routes } from 'react-router-dom';
   import Login from './pages/Login.jsx';
   import DashboardMaster from './pages/DashboardMaster.jsx';
   import DashboardInfluencer from './pages/DashboardInfluencer.jsx';

   export default function App() {
     return (
       <Routes>
         <Route path="/" element={<Navigate to="/login" replace />} />
         <Route path="/login" element={<Login />} />
         <Route path="/dashboard/master" element={<DashboardMaster />} />
         <Route path="/dashboard/influencer" element={<DashboardInfluencer />} />
         <Route path="*" element={<Navigate to="/login" replace />} />
       </Routes>
     );
   }
   ```

---

## Etapa 6 — Conversão das páginas HTML em componentes React

Converta cada página mantendo a hierarquia HTML original, apenas adaptando atributos (`class` → `className`, `for` → `htmlFor` etc.) e substituindo scripts por hooks/contextos.

### 6.1 Login (`public/login.html` → `frontend/src/pages/Login.jsx`)

```jsx
// frontend/src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/auth.js';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      const { role } = await login({ email, password });
      if (role === 'master') {
        navigate('/dashboard/master');
      } else {
        navigate('/dashboard/influencer');
      }
    } catch (error) {
      setMessage(error.message || 'Não foi possível realizar o login.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-soft via-white to-pink-soft px-4 py-16 text-ink">
      <div className="mx-auto max-w-xl rounded-3xl bg-white/80 p-10 shadow-soft">
        <section className="space-y-6">
          <h2 className="text-3xl font-semibold text-pink-strong">Login Pinklover</h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink/80">
              Email ou telefone
              <input
                id="loginEmail"
                name="email"
                type="text"
                placeholder="Digite seu email ou telefone"
                autoComplete="username"
                required
                className="rounded-2xl border border-pink-medium/40 bg-white/70 px-4 py-3 text-base text-ink shadow-inner focus:border-pink-strong focus:outline-none"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink/80">
              Senha
              <input
                id="loginPassword"
                name="password"
                type="password"
                placeholder="********"
                required
                minLength={6}
                autoComplete="current-password"
                className="rounded-2xl border border-pink-medium/40 bg-white/70 px-4 py-3 text-base text-ink shadow-inner focus:border-pink-strong focus:outline-none"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-full bg-pink-strong px-4 py-3 text-lg font-semibold text-white transition hover:bg-pink-medium disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          {!!message && (
            <div id="loginMessage" className="rounded-2xl border border-pink-medium/40 bg-white/60 px-4 py-3 text-sm text-pink-strong">
              {message}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

### 6.2 Dashboard Master (`public/master.html` → `frontend/src/pages/DashboardMaster.jsx`)

Replique as seções HTML originais (cards, tabelas e gráficos). O exemplo abaixo mostra a estrutura inicial e a captura de dados via API:

```jsx
// frontend/src/pages/DashboardMaster.jsx
import React, { useEffect, useState } from 'react';
import { getMasterOverview } from '../services/dashboard.js';

export default function DashboardMaster() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getMasterOverview()
      .then(setOverview)
      .catch((err) => setError(err.message || 'Não foi possível carregar o dashboard.'));
  }, []);

  if (error) {
    return <p className="p-6 text-center text-red-600">{error}</p>;
  }

  if (!overview) {
    return <p className="p-6 text-center text-ink/70">Carregando dashboard...</p>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-pink-soft/40 to-white px-6 py-10 text-ink">
      <header className="mx-auto flex max-w-6xl flex-col gap-4 rounded-3xl bg-white/80 px-8 py-6 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-pink-strong">Dashboard Master</h1>
          <p className="text-sm text-ink/60">Resumo consolidado das influenciadoras, vendas e scripts ativos.</p>
        </div>
        <div className="rounded-2xl bg-pink-soft/80 px-6 py-4 text-sm font-medium text-pink-strong">
          Última atualização: {overview.updatedAt}
        </div>
      </header>

      <section className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-3">
        {overview.cards.map((card) => (
          <article key={card.title} className="rounded-3xl bg-white/90 p-6 shadow-soft">
            <p className="text-sm font-medium text-ink/60">{card.title}</p>
            <strong className="mt-3 block text-3xl font-semibold text-pink-strong">{card.value}</strong>
            <span className={`mt-2 inline-flex items-center gap-2 text-sm ${card.trend.startsWith('+') ? 'text-green-600' : 'text-red-500'}`}>
              {card.trend}
            </span>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-2">
        <div className="rounded-3xl bg-white/90 p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-pink-strong">Top Influenciadoras</h2>
          <ul className="mt-4 space-y-3">
            {overview.topInfluencers.map((influencer) => (
              <li key={influencer.id} className="flex items-center justify-between rounded-2xl bg-pink-soft/50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{influencer.name}</p>
                  <span className="text-xs text-ink/60">{influencer.segment}</span>
                </div>
                <strong className="text-base text-pink-strong">{influencer.points}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl bg-white/90 p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-pink-strong">Scripts recentes</h2>
          <ul className="mt-4 space-y-3">
            {overview.scripts.map((script) => (
              <li key={script.id} className="flex items-center justify-between rounded-2xl border border-pink-soft/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{script.title}</p>
                  <span className="text-xs text-ink/60">{script.channel}</span>
                </div>
                <time className="text-xs text-ink/60">{script.publishedAt}</time>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
```

### 6.3 Dashboard Influenciadora (`public/influencer.html` → `frontend/src/pages/DashboardInfluencer.jsx`)

```jsx
// frontend/src/pages/DashboardInfluencer.jsx
import React, { useEffect, useState } from 'react';
import { getInfluencerOverview } from '../services/dashboard.js';

export default function DashboardInfluencer() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getInfluencerOverview()
      .then(setOverview)
      .catch((err) => setError(err.message || 'Não foi possível carregar o painel.'));
  }, []);

  if (error) {
    return <p className="p-6 text-center text-red-600">{error}</p>;
  }

  if (!overview) {
    return <p className="p-6 text-center text-ink/70">Carregando painel...</p>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-pink-soft/40 to-white px-6 py-10 text-ink">
      <header className="mx-auto flex max-w-5xl flex-col gap-4 rounded-3xl bg-white/80 px-8 py-6 shadow-soft">
        <h1 className="text-3xl font-semibold text-pink-strong">Bem-vinda, {overview.profile.name}</h1>
        <p className="text-sm text-ink/60">Acompanhe suas metas semanais, scripts e novidades do programa.</p>
      </header>

      <section className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-2">
        <article className="rounded-3xl bg-white/90 p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-pink-strong">Metas da semana</h2>
          <ul className="mt-4 space-y-3">
            {overview.goals.map((goal) => (
              <li key={goal.id} className="flex items-center justify-between rounded-2xl bg-pink-soft/60 px-4 py-3">
                <span className="text-sm font-medium">{goal.title}</span>
                <span className="text-sm text-pink-strong">{goal.progress}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-3xl bg-white/90 p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-pink-strong">Scripts recomendados</h2>
          <ul className="mt-4 space-y-3">
            {overview.scripts.map((script) => (
              <li key={script.id} className="rounded-2xl border border-pink-soft/70 px-4 py-3">
                <p className="text-sm font-semibold">{script.title}</p>
                <span className="text-xs text-ink/60">{script.channel}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
```

> **Dica:** Utilize `clsx` para mapear classes CSS legadas (presentes em `public/style.css`) para utilitários Tailwind enquanto migra gradualmente.

---

## Etapa 7 — Serviços de API e integração com o backend Express

1. Centralize as chamadas HTTP em `frontend/src/lib/api.js`:

   ```js
   // frontend/src/lib/api.js
   export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

   const ensureLeadingSlash = (path) => (path.startsWith('/') ? path : `/${path}`);

   export async function apiFetch(path, options = {}) {
     const target = `${API_BASE_URL}${ensureLeadingSlash(path)}`;
     const headers = new Headers(options.headers || {});

     if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
       headers.set('Content-Type', 'application/json');
     }

     const response = await fetch(target, {
       credentials: options.credentials ?? 'include',
       ...options,
       headers
     });

     if (!response.ok) {
       const message = await response.text().catch(() => response.statusText);
       throw new Error(message || `Request failed with status ${response.status}`);
     }

     const contentType = response.headers.get('content-type');
     if (contentType && contentType.includes('application/json')) {
       return response.json();
     }

     return response.text();
   }
   ```

2. Implemente helpers para login e dashboards:

   ```js
   // frontend/src/services/auth.js
   import { apiFetch } from '../lib/api.js';

   export async function login(credentials) {
     return apiFetch('/auth/login', {
       method: 'POST',
       body: JSON.stringify(credentials)
     });
   }

   export async function logout() {
     return apiFetch('/auth/logout', { method: 'POST' });
   }
   ```

   ```js
   // frontend/src/services/dashboard.js
   import { apiFetch } from '../lib/api.js';

   export function getMasterOverview() {
     return apiFetch('/master/overview');
   }

   export function getInfluencerOverview() {
     return apiFetch('/influencer/overview');
   }
   ```

3. Reutilize os endpoints existentes (`backend/routes/**`) sem modificar o backend.

---

## Etapa 8 — Servindo o build React pelo backend Express

1. Certifique-se de que o backend já está preparado para servir arquivos estáticos do `frontend/dist`. Em `backend/server.js`, valide que os diretórios estão registrados:

   ```js
   // Trecho relevante de backend/server.js
   const path = require('path');
   const fs = require('node:fs');
   const app = express();

   const publicDir = path.join(__dirname, '..', 'public');
   const frontendDistDir = path.join(__dirname, '..', 'frontend', 'dist');

   [frontendDistDir, publicDir]
     .filter((dir) => fs.existsSync(dir))
     .forEach((dir) => app.use(express.static(dir)));

   app.get('*', (req, res, next) => {
     if (req.path.startsWith('/api')) {
       return next();
     }

     const indexHtml = path.join(frontendDistDir, 'index.html');
     if (fs.existsSync(indexHtml)) {
       return res.sendFile(indexHtml);
     }

     return next();
   });
   ```

2. Garanta que as rotas `/api/**` continuem respondendo normalmente e que as rotas client-side do React sejam tratadas pelo fallback acima.

---

## Etapa 9 — Scripts de execução e build

1. Ambiente de desenvolvimento (frontend + backend em paralelo):

   ```bash
   npm run dev
   ```

   - Backend: http://localhost:3000
   - Frontend: http://localhost:5173 (Vite com proxy para `/api`)

2. Build de produção do frontend:

   ```bash
   npm run build
   ```

   O comando gera `frontend/dist/`. Após o build, rode o backend normalmente para servir os arquivos estáticos:

   ```bash
   npm start
   ```

3. Pré-visualização do build com o Vite:

   ```bash
   npm run preview
   ```

---

## Etapa 10 — Testes e validações

1. **Fluxo completo:** após `npm run dev`, valide manualmente:
   - Login → Dashboard Master
   - Login → Dashboard Influenciadora
   - Links e navegação interna

2. **Integração com backend:** utilize o console do navegador ou ferramentas como Insomnia/Postman para confirmar que as rotas `/api` continuam entregando as mesmas respostas JSON.

3. **Verificação visual:** compare o layout renderizado no React com as páginas `public/*.html`. Ajuste classes Tailwind para preservar fontes, espaçamentos e cores.

4. **Build final:** execute `npm run build` e em seguida `npm start`. Acesse http://localhost:3000 para validar o fallback de rotas client-side.

5. **Testes automatizados (opcional):** se houver testes Node (pasta `tests/`), rode `npm test` para garantir que o backend permanece íntegro.

---

Seguindo as etapas acima, o frontend legado será gradualmente substituído por componentes React com Tailwind, mantendo a paridade visual e funcional, enquanto o backend Express + SQLite continua servindo as mesmas rotas e integrações.

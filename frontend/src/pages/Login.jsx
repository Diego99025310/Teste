import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredRole, getToken, login as loginRequest } from '../services/api.js';

function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }
    const role = getStoredRole();
    if (role === 'master') {
      navigate('/dashboard/master', { replace: true });
    } else if (role === 'influencer') {
      navigate('/dashboard/influencer', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setMessageType('');
    setIsSubmitting(true);

    try {
      const payload = await loginRequest({ identifier, password });
      const role = payload?.user?.role;
      setMessage('Login realizado com sucesso! Redirecionando...');
      setMessageType('success');

      if (role === 'master') {
        navigate('/dashboard/master', { replace: true });
      } else if (role === 'influencer') {
        navigate('/dashboard/influencer', { replace: true });
      } else {
        navigate('/dashboard/master', { replace: true });
      }
    } catch (error) {
      setMessage(error.message || 'Não foi possível realizar o login.');
      setMessageType('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container" data-page="login">
      <section className="card">
        <h2>Login Pinklover</h2>
        <form id="loginForm" onSubmit={handleSubmit}>
          <label>
            Email ou telefone
            <input
              id="loginEmail"
              name="email"
              type="text"
              placeholder="Digite seu email ou telefone"
              required
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={isSubmitting}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
            />
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <div
          id="loginMessage"
          className="message"
          aria-live="polite"
          data-type={messageType || undefined}
        >
          {message}
        </div>
      </section>
    </div>
  );
}

export default Login;

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMasterDashboard, getStoredRole, getToken, logout as logoutSession } from '../services/api.js';

const formatCycle = (cycle) => {
  if (!cycle) return '–';
  const month = String(cycle.cycle_month ?? cycle.month ?? '').padStart(2, '0');
  const year = cycle.cycle_year ?? cycle.year ?? '';
  if (!month || !year) {
    return 'Ciclo atual';
  }
  return `${month}/${year}`;
};

function DashboardMaster() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    const role = getStoredRole();
    if (role && role !== 'master') {
      navigate('/dashboard/influencer', { replace: true });
      return;
    }

    const loadDashboard = async () => {
      setIsLoading(true);
      setMessage('');
      setMessageType('');
      try {
        const data = await getMasterDashboard();
        setDashboard(data);
        if (data?.stats) {
          setMessage(`Ciclo ${formatCycle(data.cycle)} — ${data.stats.totalInfluencers} influenciadoras, ${data.stats.pendingValidations} validações pendentes.`);
          setMessageType(data.stats.pendingValidations > 0 ? 'warning' : 'success');
        }
      } catch (error) {
        setMessage(error.message || 'Não foi possível carregar o painel do master.');
        setMessageType('error');
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [navigate]);

  const statsSummary = useMemo(() => {
    if (!dashboard?.stats) return null;
    const { stats } = dashboard;
    return [
      { label: 'Influenciadoras', value: stats.totalInfluencers },
      { label: 'Posts planejados', value: stats.plannedPosts },
      { label: 'Posts validados', value: stats.validatedPosts },
      { label: 'Alertas', value: stats.alerts },
    ];
  }, [dashboard]);

  const handleLogout = () => {
    logoutSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="container" data-page="master-home">
      <header>
        <h1>Painel do Master</h1>
        <p>Escolha a funcao desejada para gerenciar o sistema.</p>
        <button type="button" data-action="logout" onClick={handleLogout}>
          Sair
        </button>
      </header>

      <section className="card">
        <h2>Acessos rapidos</h2>
        <div className="link-grid">
          <a className="link-card" href="master-create.html">
            Cadastrar influenciadora
          </a>
          <a className="link-card" href="master-consult.html">
            Consulta de influenciadoras
          </a>
          <a className="link-card" href="master-list.html">
            Influenciadoras cadastradas
          </a>
          <a className="link-card" href="master-sku-points.html">
            Pontos por SKU
          </a>
          <a className="link-card" href="master-sales.html">
            Registrar venda
          </a>
          <a className="link-card" href="master-scripts.html">
            Gerenciar roteiros
          </a>
          <a className="link-card" href="pinklovers-master.html">
            Painel Pinklovers
          </a>
        </div>

        <div
          id="masterDashboardMessage"
          className="message"
          aria-live="polite"
          data-type={messageType || undefined}
        >
          {isLoading ? 'Carregando dados do ciclo...' : message}
        </div>

        {statsSummary && statsSummary.length > 0 && (
          <ul className="master-dashboard-stats">
            {statsSummary.map((item) => (
              <li key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default DashboardMaster;

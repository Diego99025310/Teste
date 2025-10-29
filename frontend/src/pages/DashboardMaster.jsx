import React from 'react';
import Header from '../components/Header.jsx';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import DashboardChart from '../components/DashboardChart.jsx';
import DashboardLayout from '../layout/DashboardLayout.jsx';

const metricCards = [
  {
    label: 'Receita do ciclo atual',
    value: 'R$ 128.940,00',
    detail: '+18% vs ciclo anterior',
    accent: 'bg-gradient-to-r from-pink-strong to-pink-medium',
    shadow: 'shadow-xl shadow-pink-strong/30',
    valueClass: 'text-white',
    textClass: 'text-white/80'
  },
  {
    label: 'Influenciadoras ativas',
    value: '87',
    detail: '12 aguardando treinamento',
    accent: 'bg-white',
    shadow: 'shadow-soft',
    valueClass: 'text-ink',
    textClass: 'text-ink/60'
  },
  {
    label: 'Pedidos validados',
    value: '1.982',
    detail: 'R$ 98.500 em pontos',
    accent: 'bg-white',
    shadow: 'shadow-soft',
    valueClass: 'text-ink',
    textClass: 'text-ink/60'
  }
];

const chartData = [
  { label: 'Jan', value: 52000, posts: 210 },
  { label: 'Fev', value: 61000, posts: 248 },
  { label: 'Mar', value: 72000, posts: 279 },
  { label: 'Abr', value: 68000, posts: 260 },
  { label: 'Mai', value: 82000, posts: 294 },
  { label: 'Jun', value: 91000, posts: 312 }
];

const pendingValidations = [
  { name: 'Juliana Moraes', coupon: 'JULIPINK', platform: 'Shopify', status: 'Validar vendas' },
  { name: 'Camila Torres', coupon: 'CAMIPWR', platform: 'Loja Integrada', status: 'Aprovar stories' },
  { name: 'Lais Andrade', coupon: 'LAISLUX', platform: 'Shopify', status: 'Atualizar contrato' }
];

export function DashboardMaster() {
  return (
    <DashboardLayout>
      <Header
        title="Painel Master"
        subtitle="Visão consolidada do ciclo mensal, importações e performance das influenciadoras."
        actions={
          <Button size="sm" className="shadow-soft">
            Criar nova campanha
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((card) => (
          <Card
            key={card.label}
            className={`${card.accent} ${card.shadow} transition-transform duration-200 hover:-translate-y-1`}
          >
            <p
              className={`text-sm font-semibold uppercase tracking-[0.2em] ${
                card.textClass || 'text-ink/60'
              }`}
            >
              {card.label}
            </p>
            <p className={`text-3xl font-semibold md:text-4xl ${card.valueClass || 'text-ink'}`}>{card.value}</p>
            <p className={`text-sm ${card.textClass || 'text-ink/60'}`}>{card.detail}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <DashboardChart
            title="Receita consolidada"
            subtitle="Histórico dos últimos 6 meses considerando pedidos validados"
            data={chartData}
          />
        </div>
        <Card className="lg:col-span-2" padding="p-0">
          <div className="flex items-center justify-between border-b border-white/60 p-6 md:p-8">
            <div>
              <h3 className="text-xl font-semibold text-ink">Validações pendentes</h3>
              <p className="text-sm text-ink/60">Última atualização há 4 minutos</p>
            </div>
            <Button variant="secondary" size="sm">
              Ver todas
            </Button>
          </div>
          <ul className="space-y-4 p-6 md:p-8">
            {pendingValidations.map((item) => (
              <li key={item.coupon} className="flex flex-col gap-2 rounded-2xl bg-pink-soft/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.name}</p>
                    <p className="text-xs text-ink/60">{item.platform}</p>
                  </div>
                  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-pink-strong shadow-sm">
                    {item.coupon}
                  </span>
                </div>
                <Button size="sm" variant="ghost" className="justify-start text-pink-strong">
                  {item.status}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-ink">Últimas importações de vendas</h3>
            <p className="text-sm text-ink/60">
              Monitore a qualidade dos arquivos enviados e confirme os pedidos validados por influenciadora.
            </p>
          </div>
          <Button size="sm" variant="secondary">
            Importar CSV
          </Button>
        </div>
        <div className="mt-6 overflow-hidden rounded-3xl border border-pink-soft/50">
          <table className="min-w-full divide-y divide-pink-soft/60 text-sm">
            <thead className="bg-pink-soft/50 text-left text-xs font-semibold uppercase tracking-wider text-pink-strong">
              <tr>
                <th className="px-5 py-4">Data</th>
                <th className="px-5 py-4">Cupom</th>
                <th className="px-5 py-4">Pedidos</th>
                <th className="px-5 py-4">Pontuação</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-soft/60 bg-white/80">
              {[
                { date: '14/06/2024', coupon: 'BRUPWR', orders: 182, points: '12.400', status: 'Aprovado' },
                { date: '13/06/2024', coupon: 'CAROLXP', orders: 89, points: '6.510', status: 'Revisão' },
                { date: '12/06/2024', coupon: 'NATHGLOW', orders: 210, points: '14.230', status: 'Processando' }
              ].map((row) => (
                <tr key={`${row.coupon}-${row.date}`} className="transition-colors hover:bg-pink-soft/30">
                  <td className="px-5 py-4 font-medium text-ink">{row.date}</td>
                  <td className="px-5 py-4 text-pink-strong">{row.coupon}</td>
                  <td className="px-5 py-4">{row.orders}</td>
                  <td className="px-5 py-4">{row.points}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-pink-soft/70 px-3 py-1 text-xs font-semibold text-pink-strong">
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}

export default DashboardMaster;

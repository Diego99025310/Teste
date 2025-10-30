import React from 'react';
import Header from '../components/Header.jsx';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import DashboardChart from '../components/DashboardChart.jsx';
import DashboardLayout from '../layout/DashboardLayout.jsx';

const schedule = [
  {
    date: '18 JUN',
    day: 'terça',
    tasks: [
      { label: 'Feed - Review HidraPink Cleanser', status: 'Aprovado' },
      { label: 'Stories - Bastidores do unboxing', status: 'Pendente' }
    ]
  },
  {
    date: '20 JUN',
    day: 'quinta',
    tasks: [
      { label: 'Reels - Desafio rotina glow', status: 'Em revisão' }
    ]
  },
  {
    date: '23 JUN',
    day: 'domingo',
    tasks: [
      { label: 'Liveshopping - Resenha completa', status: 'Confirmado' }
    ]
  }
];

const performance = [
  { label: 'Pedidos confirmados', value: '128', detail: '+22% vs ciclo anterior' },
  { label: 'Pontuação acumulada', value: '9.420 pts', detail: 'Equivalente a R$ 4.710,00' },
  { label: 'Ticket médio', value: 'R$ 489,00', detail: 'Meta: R$ 500,00' }
];

const chartData = [
  { label: 'Seg', value: 8200, posts: 2 },
  { label: 'Ter', value: 9000, posts: 3 },
  { label: 'Qua', value: 7500, posts: 2 },
  { label: 'Qui', value: 10400, posts: 4 },
  { label: 'Sex', value: 9800, posts: 3 },
  { label: 'Sáb', value: 6500, posts: 1 },
  { label: 'Dom', value: 7200, posts: 2 }
];

export function DashboardInfluencer() {
  return (
    <DashboardLayout>
      <Header
        title="Painel da Influenciadora"
        subtitle="Acompanhe suas metas, validações e agenda de ativações da semana."
        actions={
          <Button size="sm" variant="secondary">
            Baixar material da campanha
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        {performance.map((item) => (
          <Card key={item.label} className="bg-white/80 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-medium">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{item.value}</p>
            <p className="text-sm text-ink/60">{item.detail}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardChart
          title="Vendas validadas na semana"
          subtitle="Pontuação acumulada por dia, baseada nos pedidos aprovados"
          data={chartData}
        />
        <Card className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-ink">Agenda da semana</h3>
              <p className="text-sm text-ink/60">Organize suas entregas e envie os conteúdos para aprovação.</p>
            </div>
            <Button size="sm">Enviar conteúdo</Button>
          </div>
          <div className="space-y-4">
            {schedule.map((day) => (
              <div key={day.date} className="rounded-3xl bg-gradient-to-br from-white to-pink-soft/70 p-4 shadow-inner">
                <header className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pink-medium">{day.day}</p>
                    <p className="text-3xl font-semibold text-pink-strong">{day.date}</p>
                  </div>
                  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-pink-strong shadow-sm">
                    {day.tasks.length} entregas
                  </span>
                </header>
                <ul className="mt-4 space-y-3">
                  {day.tasks.map((task) => (
                    <li key={task.label} className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-ink">{task.label}</p>
                        <p className="text-xs text-ink/60">Enviar até 18h</p>
                      </div>
                      <span className="rounded-full bg-pink-soft/70 px-3 py-1 text-xs font-semibold text-pink-strong">
                        {task.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-xl font-semibold text-ink">Scripts sugeridos</h3>
        <p className="mt-2 text-sm text-ink/60">
          Use os scripts abaixo para manter a consistência da narrativa HidraPink nas suas ativações.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            {
              title: 'Stories - Checklist diário',
              content:
                'Comece mostrando os produtos na bancada, enfatize a textura e finalize com uma chamada para o cupom HIDRAGLOW.'
            },
            {
              title: 'Feed - Carrossel rotina glow',
              content: 'Use 5 imagens com legendas curtas destacando benefícios e reforce o resultado após 30 dias.'
            }
          ].map((script) => (
            <div key={script.title} className="rounded-3xl bg-white/80 p-5 shadow-soft">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pink-medium/80">{script.title}</p>
              <p className="mt-3 text-sm text-ink/70">{script.content}</p>
              <Button size="sm" variant="ghost" className="mt-4 text-pink-strong">
                Copiar roteiro
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </DashboardLayout>
  );
}

export default DashboardInfluencer;

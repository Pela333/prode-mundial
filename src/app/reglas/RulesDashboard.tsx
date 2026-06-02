'use client'

import { useState } from 'react'
import {
  Trophy,
  LayoutGrid,
  Swords,
  Award,
  Calculator,
  ListOrdered,
  Star,
  Info,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  TrendingUp,
  ShieldCheck,
  ChevronRight
} from 'lucide-react'

function cleanScoreInput(val: string): string {
  let clean = val.replace(/\D/g, '')
  if (clean.length > 1 && clean.startsWith('0')) {
    clean = String(parseInt(clean, 10))
  }
  return clean.slice(0, 2)
}


export default function RulesDashboard() {
  const [activeTab, setActiveTab] = useState<'grupos' | 'eliminatorias' | 'podio' | 'simulador'>('grupos')

  // Estado del simulador
  const [simPhase, setSimPhase] = useState<'groups' | 'knockout'>('groups')
  const [predHome, setPredHome] = useState<string>('2')
  const [predAway, setPredAway] = useState<string>('1')
  const [realHome, setRealHome] = useState<string>('2')
  const [realAway, setRealAway] = useState<string>('1')
  const [predPenWinner, setPredPenWinner] = useState<'home' | 'away'>('home')
  const [realPenWinner, setRealPenWinner] = useState<'home' | 'away'>('home')
  const [groupPosBonus, setGroupPosBonus] = useState<boolean>(false)

  // Cálculo de puntos del simulador
  const valPredHome = parseInt(predHome, 10) || 0
  const valPredAway = parseInt(predAway, 10) || 0
  const valRealHome = parseInt(realHome, 10) || 0
  const valRealAway = parseInt(realAway, 10) || 0

  const predDiff = valPredHome - valPredAway
  const realDiff = valRealHome - valRealAway
  const predOutcome = predDiff > 0 ? 'home' : predDiff < 0 ? 'away' : 'draw'
  const realOutcome = realDiff > 0 ? 'home' : realDiff < 0 ? 'away' : 'draw'

  const isExact = valPredHome === valRealHome && valPredAway === valRealAway
  const isOutcome = predOutcome === realOutcome

  let simPoints = 0
  const simBreakdown: { label: string; pts: number }[] = []

  if (isExact) {
    simPoints += 3
    simBreakdown.push({ label: 'Resultado exacto', pts: 3 })
  } else if (isOutcome) {
    simPoints += 1
    simBreakdown.push({ label: 'Resultado / Ganador correcto (no exacto)', pts: 1 })
  } else {
    simBreakdown.push({ label: 'Resultado incorrecto', pts: 0 })
  }

  if (simPhase === 'knockout') {
    if (realOutcome === 'draw') {
      if (predPenWinner === realPenWinner) {
        simPoints += 1
        simBreakdown.push({ label: 'Ganador de penales correcto', pts: 1 })
      } else {
        simBreakdown.push({ label: 'Ganador de penales incorrecto', pts: 0 })
      }
    }
    if (groupPosBonus) {
      simPoints += 1
      simBreakdown.push({ label: 'Bonus por posicionamiento de grupo', pts: 1 })
    }
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Encabezado */}
      <div className="relative rounded-3xl overflow-hidden border border-white/5 bg-gradient-to-r from-amber-500/10 via-[#111827] to-[#111827] p-8 md:p-12 shadow-2xl">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />
        <div className="relative max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles size={12} />
            Reglamento Oficial
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white leading-tight">
            Sistema de <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">Puntuación</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Aquí explicamos con precisión cómo sumás puntos en cada fase del Mundial y las reglas que definen la tabla de posiciones general. ¡Jugá, calculá y competí por el podio!
          </p>
        </div>
      </div>

      {/* Selector de pestañas */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-[#111827]/80 border border-white/5 backdrop-blur-xl">
        {[
          { id: 'grupos', label: 'Fase de Grupos', icon: LayoutGrid },
          { id: 'eliminatorias', label: 'Fase Eliminatoria', icon: Swords },
          { id: 'podio', label: 'Podio & Desempates', icon: Trophy },
          { id: 'simulador', label: 'Simulador de Puntos', icon: Calculator },
        ].map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all shrink-0 cursor-pointer ${
                active
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 scale-[1.02]'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Contenido principal por pestaña */}
      <div className="grid gap-6">
        {/* TABA: Fase de Grupos */}
        {activeTab === 'grupos' && (
          <div className="grid md:grid-cols-3 gap-6 animate-fade-in-up">
            <div className="md:col-span-2 space-y-6">
              <div className="rounded-2xl border border-white/5 bg-[#111827]/40 p-6 md:p-8 backdrop-blur-md space-y-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                  <LayoutGrid className="text-amber-400" size={20} />
                  Predicciones en Fase de Grupos
                </h2>
                <p className="text-slate-300 text-sm leading-relaxed">
                  En la Fase de Grupos se pronostican los marcadores de los <strong>72 partidos</strong> de los 12 grupos (Grupos A al L). El pronóstico se hace sobre el resultado obtenido en el tiempo reglamentario de <strong>90 minutos</strong>.
                </p>

                {/* Tabla de puntajes */}
                <div className="overflow-hidden rounded-xl border border-white/5 bg-[#0a0f1e]">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-white/5 text-slate-400 font-medium">
                        <th className="p-4 border-b border-white/5">Acierto en Partido</th>
                        <th className="p-4 border-b border-white/5 text-right">Puntos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      <tr>
                        <td className="p-4 font-semibold text-white">Resultado Exacto</td>
                        <td className="p-4 text-right font-bold text-amber-400 text-lg">+3</td>
                      </tr>
                      <tr>
                        <td className="p-4">
                          <p className="font-semibold text-white">Ganador / Empate correcto</p>
                          <p className="text-xs text-slate-500">Acertaste la tendencia pero no el marcador exacto.</p>
                        </td>
                        <td className="p-4 text-right font-bold text-slate-200 text-lg">+1</td>
                      </tr>
                      <tr>
                        <td className="p-4 text-slate-500">Resultado incorrecto</td>
                        <td className="p-4 text-right text-slate-500">0</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 text-xs text-amber-300/90 leading-relaxed">
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <strong>Cierre de Fase 1:</strong> Existe una única fecha y hora límite global para la Fase 1. Todos tus 72 pronósticos deben estar completos antes de este límite. Al confirmar el envío, tus elecciones quedarán en modo lectura.
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Derecha - Posicionamiento de grupo */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/5 bg-[#111827]/40 p-6 backdrop-blur-md space-y-4">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold uppercase tracking-wider">
                  <Star size={12} />
                  Bonus de Grupo
                </div>
                <h3 className="text-lg font-bold text-white">Posición de Equipo</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Sumás <strong>+2 puntos</strong> por cada equipo que termine en la posición real exacta del grupo (1°, 2°, 3° o 4°).
                </p>
                <div className="p-4 rounded-xl bg-[#0a0f1e] border border-white/5 text-center">
                  <div className="text-3xl font-black text-purple-400">+2 pts</div>
                  <div className="text-xs text-slate-500 mt-1">Por equipo acertado en su posición</div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  <strong>Nota del sistema:</strong> Vos no elegís las posiciones directamente. El sistema calcula automáticamente la tabla simulada de tus grupos a partir de los goles que cargues en tus pronósticos de partidos.
                </p>
                <div className="pt-2 border-t border-white/5 text-xs text-slate-500">
                  Máximo posible: 4 equipos × 12 grupos = <strong className="text-purple-400">96 pts</strong>.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TABA: Fase Eliminatoria */}
        {activeTab === 'eliminatorias' && (
          <div className="grid md:grid-cols-3 gap-6 animate-fade-in-up">
            <div className="md:col-span-2 space-y-6">
              <div className="rounded-2xl border border-white/5 bg-[#111827]/40 p-6 md:p-8 backdrop-blur-md space-y-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                  <Swords className="text-amber-400" size={20} />
                  Predicciones en Fase Eliminatoria
                </h2>
                <p className="text-slate-300 text-sm leading-relaxed">
                  La fase eliminatoria abarca <strong>31 partidos</strong> (16avos hasta la final). Aquí se pronostica el marcador al finalizar los <strong>120 minutos de juego</strong> (tiempo reglamentario de 90' más prórroga de 30', antes de la tanda de penales).
                </p>

                {/* Tabla de puntajes */}
                <div className="overflow-hidden rounded-xl border border-white/5 bg-[#0a0f1e]">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-white/5 text-slate-400 font-medium">
                        <th className="p-4 border-b border-white/5">Acierto en Partido (a 120')</th>
                        <th className="p-4 border-b border-white/5 text-right">Puntos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      <tr>
                        <td className="p-4 font-semibold text-white">Resultado Exacto a 120'</td>
                        <td className="p-4 text-right font-bold text-amber-400 text-lg">+3</td>
                      </tr>
                      <tr>
                        <td className="p-4">
                          <p className="font-semibold text-white">Ganador / Empate a 120'</p>
                          <p className="text-xs text-slate-500">Acertaste la tendencia al término del alargue pero no los goles exactos.</p>
                        </td>
                        <td className="p-4 text-right font-bold text-slate-200 text-lg">+1</td>
                      </tr>
                      <tr>
                        <td className="p-4">
                          <p className="font-semibold text-white">Ganador por Penales correcto</p>
                          <p className="text-xs text-slate-500">Solo computa si el partido real terminó empatado en los 120' e ingresa en tanda de penales.</p>
                        </td>
                        <td className="p-4 text-right font-bold text-green-400 text-lg">+1</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 text-xs text-purple-300/90 leading-relaxed">
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <strong>Ganador por Penales obligatorio:</strong> El sistema requiere que elijas un ganador por penales en tu pronóstico eliminatorio obligatoriamente, por si el partido llega a esa instancia.
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Derecha - Info Adicional Eliminatoria */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/5 bg-[#111827]/40 p-6 backdrop-blur-md space-y-4">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                  <Star size={12} />
                  Bonus Posicionamiento
                </div>
                <h3 className="text-lg font-bold text-white">Bonus de Clasificación</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Sumás <strong>+1 punto de bonus</strong> en un partido si el equipo que resultó ganador del partido real fue ubicado por vos en esa misma posición exacta del grupo durante la Fase 1.
                </p>
                <div className="p-4 rounded-xl bg-[#0a0f1e] border border-white/5 text-center">
                  <div className="text-3xl font-black text-amber-400">+1 pt</div>
                  <div className="text-xs text-slate-500 mt-1">Por partido acertado en origen</div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Este bonus premia tu capacidad de proyectar qué equipos clasificarían en determinada posición y cómo se desempeñarían en los cruces eliminatorios.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-[#111827]/40 p-6 backdrop-blur-md space-y-3">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Habilitación de Fase 2</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Fase 2 se abre en dos partes:
                </p>
                <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                  <li><strong>Parte 1 (1er partido)</strong>: Abre al definirse el cruce real. Cierra 1h antes del partido.</li>
                  <li><strong>Parte 2 (30 restantes)</strong>: Abre al definirse todos los cruces de 16avos. Cierra 1h antes de iniciarse el 2do partido de 16avos.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TABA: Podio y Desempates */}
        {activeTab === 'podio' && (
          <div className="grid md:grid-cols-2 gap-6 animate-fade-in-up">
            {/* Tarjeta Podio */}
            <div className="rounded-2xl border border-white/5 bg-[#111827]/40 p-6 md:p-8 backdrop-blur-md space-y-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                <Award className="text-amber-400" size={22} />
                Bonus de Podio Final
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Al final del torneo, el sistema calcula puntos extra según el acierto en la definición exacta de los cuatro mejores equipos del Mundial:
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { pos: 'Campeón', pts: 15, color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/10' },
                  { pos: 'Subcampeón', pts: 8, color: 'text-slate-300', bg: 'bg-slate-500/5 border-slate-500/10' },
                  { pos: 'Tercer Puesto', pts: 5, color: 'text-amber-600', bg: 'bg-amber-700/5 border-amber-700/10' },
                  { pos: 'Cuarto Puesto', pts: 3, color: 'text-amber-800', bg: 'bg-amber-900/5 border-amber-900/10' },
                ].map(item => (
                  <div key={item.pos} className={`rounded-xl border p-4 text-center ${item.bg}`}>
                    <span className="text-xs text-slate-400 font-medium block mb-1">{item.pos}</span>
                    <span className={`text-2xl font-black ${item.color}`}>+{item.pts} pts</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tarjeta Desempates */}
            <div className="rounded-2xl border border-white/5 bg-[#111827]/40 p-6 md:p-8 backdrop-blur-md space-y-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                <ListOrdered className="text-amber-400" size={22} />
                Criterios de Desempate
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Si dos o más participantes igualan en la puntuación total en el ranking, la posición relativa se define automáticamente aplicando los siguientes criterios en estricto orden de prioridad:
              </p>

              <div className="space-y-3">
                {[
                  { num: '1', title: 'Resultados Exactos Totales', desc: 'Mayor cantidad de marcadores exactos acertados en todo el torneo.' },
                  { num: '2', title: 'Posiciones de Grupo Acertadas', desc: 'Mayor cantidad de posiciones de equipo (1°-4°) exactas en Fase 1.' },
                  { num: '3', title: 'Puntos en Fase Eliminatoria', desc: 'Mayor cantidad de puntos sumados en Fase 2 (16avos a final).' },
                  { num: '4', title: 'Empate Técnico (División)', desc: 'Si persiste la igualdad absoluta, comparten la posición (se indica con ⇄).' },
                ].map(item => (
                  <div key={item.num} className="flex gap-4 p-3 rounded-xl border border-white/5 bg-[#0a0f1e] hover:border-white/10 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">
                      {item.num}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{item.title}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TABA: Simulador Interactivo */}
        {activeTab === 'simulador' && (
          <div className="grid md:grid-cols-5 gap-6 animate-fade-in-up">
            {/* Controles de Entrada */}
            <div className="md:col-span-3 rounded-2xl border border-white/5 bg-[#111827]/40 p-6 backdrop-blur-md space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calculator className="text-amber-400" size={18} />
                  Simulá un Partido
                </h2>
                {/* Selector de fase */}
                <div className="flex rounded-lg bg-white/5 p-1 border border-white/5">
                  <button
                    onClick={() => setSimPhase('groups')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                      simPhase === 'groups' ? 'bg-amber-500 text-black' : 'text-slate-400'
                    }`}
                  >
                    Grupos
                  </button>
                  <button
                    onClick={() => setSimPhase('knockout')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                      simPhase === 'knockout' ? 'bg-amber-500 text-black' : 'text-slate-400'
                    }`}
                  >
                    Eliminatoria
                  </button>
                </div>
              </div>

              {/* Contenedor Pronóstico vs Real */}
              <div className="grid grid-cols-2 gap-6 bg-[#0a0f1e] p-5 rounded-2xl border border-white/5">
                {/* Pronóstico */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider text-center border-b border-white/5 pb-2">
                      Tu Pronóstico
                    </div>
                      <div className="flex items-center justify-center gap-2 mt-4">
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 mb-1">Local</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={predHome}
                          onChange={e => setPredHome(cleanScoreInput(e.target.value))}
                          className="w-12 h-12 text-center text-lg font-bold rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-amber-500 score-input"
                        />
                      </div>
                      <span className="text-slate-600 font-bold mt-4">:</span>
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 mb-1">Visita</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={predAway}
                          onChange={e => setPredAway(cleanScoreInput(e.target.value))}
                          className="w-12 h-12 text-center text-lg font-bold rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-amber-500 score-input"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Selector de Penales Pronosticado (Siempre Requerido en Eliminatoria) */}
                  {simPhase === 'knockout' && (
                    <div className="space-y-1.5 pt-4 border-t border-white/5 mt-4">
                      <label className="text-[11px] text-slate-400 block font-semibold text-center">Ganador Penales Pronosticado</label>
                      <select
                        value={predPenWinner}
                        onChange={e => setPredPenWinner(e.target.value as any)}
                        style={{ colorScheme: 'dark' }}
                        className="w-full bg-[#0a0f1e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="home" className="bg-[#0a0f1e] text-white">Equipo Local</option>
                        <option value="away" className="bg-[#0a0f1e] text-white">Equipo Visitante</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Resultado Real */}
                <div className="space-y-4 border-l border-white/5 pl-6 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-green-400 uppercase tracking-wider text-center border-b border-white/5 pb-2">
                      Resultado Real
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 mb-1">Local</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={realHome}
                          onChange={e => setRealHome(cleanScoreInput(e.target.value))}
                          className="w-12 h-12 text-center text-lg font-bold rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-green-500 score-input"
                        />
                      </div>
                      <span className="text-slate-600 font-bold mt-4">:</span>
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-slate-500 mb-1">Visita</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={realAway}
                          onChange={e => setRealAway(cleanScoreInput(e.target.value))}
                          className="w-12 h-12 text-center text-lg font-bold rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-green-500 score-input"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Selector de Penales Real (Solo si hay empate real) */}
                  {simPhase === 'knockout' && realOutcome === 'draw' && (
                    <div className="space-y-1.5 pt-4 border-t border-white/5 mt-4">
                      <label className="text-[11px] text-green-400 block font-semibold text-center">Ganador Penales Real</label>
                      <select
                        value={realPenWinner}
                        onChange={e => setRealPenWinner(e.target.value as any)}
                        style={{ colorScheme: 'dark' }}
                        className="w-full bg-[#0a0f1e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-green-500 cursor-pointer"
                      >
                        <option value="home" className="bg-[#0a0f1e] text-white">Equipo Local</option>
                        <option value="away" className="bg-[#0a0f1e] text-white">Equipo Visitante</option>
                      </select>
                    </div>
                  )}

                  {/* Tip informativo para penales si no hay empate real */}
                  {simPhase === 'knockout' && realOutcome !== 'draw' && (
                    <div className="text-[10px] text-slate-400 bg-white/3 p-2.5 rounded-xl border border-white/5 mt-4">
                      💡 <strong>Tanda de Penales:</strong> Solo ocurre si el Resultado Real es un empate (ej. 1-1). Al empatar, aparecerá aquí el selector del ganador real.
                    </div>
                  )}
                </div>
              </div>

              {/* Bonus de grupo (Solo en eliminatoria) */}
              {simPhase === 'knockout' && (
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-[#0a0f1e] border border-white/5">
                    <div>
                      <span className="text-sm font-bold text-white block">¿Acertaste su posición de grupo?</span>
                      <span className="text-xs text-slate-500">¿El ganador real fue ubicado en la misma posición de grupo por vos en Fase 1?</span>
                    </div>
                    <button
                      onClick={() => setGroupPosBonus(!groupPosBonus)}
                      className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer ${
                        groupPosBonus ? 'bg-amber-500' : 'bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          groupPosBonus ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {simPhase === 'groups' && (
                <div className="text-xs text-slate-500 bg-[#0a0f1e] p-4 rounded-xl border border-white/5">
                  💡 <strong>Recuerda:</strong> En la Fase de Grupos no aplican penales ni bonus de posicionamiento individuales de partido. Los +2 puntos por acertar las posiciones exactas finales de cada grupo se computan aparte al finalizar la fase.
                </div>
              )}
            </div>

            {/* Resultado de la simulación */}
            <div className="md:col-span-2 rounded-2xl border border-white/5 bg-[#111827]/40 p-6 backdrop-blur-md flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider text-center">Puntos Obtenidos</h3>
                <div className="relative py-8 text-center rounded-2xl bg-white/2 border border-white/5 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
                  <div className="text-6xl font-black text-white">{simPoints}</div>
                  <div className="text-xs text-amber-400 font-semibold mt-1">puntos simulados</div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block border-b border-white/5 pb-1">Desglose</span>
                  <div className="space-y-2">
                    {simBreakdown.map((item, index) => (
                      <div key={index} className="flex justify-between items-center text-sm p-2 rounded bg-[#0a0f1e]/40 border border-white/4">
                        <span className="text-slate-300 text-xs flex items-center gap-1.5">
                          <CheckCircle2 size={13} className={item.pts > 0 ? 'text-amber-400' : 'text-slate-600'} />
                          {item.label}
                        </span>
                        <span className={`font-bold ${item.pts > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                          +{item.pts} pt{item.pts !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 italic text-center pt-4 border-t border-white/5">
                Valores calculados dinámicamente según el reglamento del Prode.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

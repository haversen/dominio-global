// Misiones de espionaje (las comparten servidor y cliente).

export const SPY_MISSIONS = {
  recon: {
    label: 'Reconocimiento', icon: '🔭',
    desc: 'Revela sus tropas durante 3 minutos, aunque esté bajo la niebla de guerra',
    cost: { money: 40 }, success: 0.9, cooldownMs: 30_000, revealMs: 180_000,
  },
  sabotage: {
    label: 'Sabotaje', icon: '💥',
    desc: 'Detiene sus obras y daña un edificio (o parte de la guarnición)',
    cost: { money: 90, industry: 20 }, success: 0.55, cooldownMs: 60_000,
  },
  steal: {
    label: 'Robar tecnología', icon: '📄',
    desc: 'Copia una investigación del dueño que tú todavía no tengas',
    cost: { money: 120, industry: 30 }, success: 0.35, cooldownMs: 120_000, needsPlayer: true,
  },
  incite: {
    label: 'Fomentar revuelta', icon: '✊',
    desc: 'Baja mucho su estabilidad: si cae demasiado, el país puede sublevarse',
    cost: { money: 100 }, success: 0.45, cooldownMs: 90_000, needsPlayer: true, stabilityHit: 40,
  },
};
export const SPY_MISSION_IDS = Object.keys(SPY_MISSIONS);

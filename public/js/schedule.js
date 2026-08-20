/* Cálculo dos dias e horários disponíveis para retirada.
   Tudo roda no relógio do próprio cliente, que está no mesmo fuso da loja. */

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MINUTE = 60_000;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days,
  date.getHours(), date.getMinutes());

function atTime(day, hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}

/** Janela de funcionamento do dia. Fechamento depois da meia-noite vira o dia seguinte. */
function windowFor(day, config) {
  const open = atTime(day, config.open);
  let close = atTime(day, config.close);
  if (close <= open) close = new Date(close.getTime() + 24 * 60 * MINUTE);
  return { open, close };
}

export function isOpenNow(store, now = new Date()) {
  for (const offset of [-1, 0]) {
    const day = addDays(startOfDay(now), offset);
    const config = store.hours?.[day.getDay()];
    if (!config || config.closed) continue;
    const { open, close } = windowFor(day, config);
    if (now >= open && now <= close) return true;
  }
  return false;
}

export function todayHoursLabel(store, now = new Date()) {
  const config = store.hours?.[now.getDay()];
  if (!config || config.closed) return 'Fechado hoje';
  return `${config.open} às ${config.close}`;
}

/** Horários de retirada de um dia, já descontando o tempo mínimo de preparo. */
function slotsFor(day, config, store, now) {
  const { open, close } = windowFor(day, config);
  const step = Math.max(5, store.slot_minutes || 15) * MINUTE;
  const earliest = new Date(now.getTime() + (store.lead_minutes || 0) * MINUTE);

  const from = Math.max(open.getTime(), earliest.getTime());
  const steps = Math.max(0, Math.ceil((from - open.getTime()) / step));

  const slots = [];
  for (let time = open.getTime() + steps * step; time <= close.getTime(); time += step) {
    slots.push(new Date(time));
  }
  return slots;
}

/** Próximos dias com pelo menos um horário livre. */
export function availableDays(store, now = new Date()) {
  const days = [];
  const maxAhead = Math.max(0, store.max_days_ahead ?? 7);

  for (let offset = 0; offset <= maxAhead; offset += 1) {
    const day = addDays(startOfDay(now), offset);
    const config = store.hours?.[day.getDay()];
    if (!config || config.closed) continue;

    const slots = slotsFor(day, config, store, now);
    if (!slots.length) continue;

    days.push({
      key: dateKey(day),
      date: day,
      offset,
      label: offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : WEEKDAYS_SHORT[day.getDay()],
      sublabel: `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`,
      slots,
    });
  }
  return days;
}

export const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const timeLabel = (date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** "hoje (qui), 21/08 às 19:30" */
export function pickupLabel(day, slot) {
  const prefix = day.offset === 0 ? 'Hoje' : day.offset === 1 ? 'Amanhã' : WEEKDAYS[day.date.getDay()];
  return `${prefix}, ${day.sublabel} às ${timeLabel(slot)}`;
}

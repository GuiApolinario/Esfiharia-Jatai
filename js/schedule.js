/* Cálculo dos dias e horários disponíveis para retirada.
   O site funciona por eventos: a loja cadastra os dias específicos do
   festival (não uma agenda semanal recorrente), cada um com seu próprio
   horário de abertura e fechamento. Pedidos param de ser aceitos alguns
   dias antes de cada evento (order_cutoff_days), para dar tempo de preparo.
   Tudo roda no relógio do próprio cliente, que está no mesmo fuso da loja. */

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days,
  date.getHours(), date.getMinutes());

function atTime(day, hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}

/** "2026-09-05" -> Date local à meia-noite. */
function parseDateKey(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/** Lista de dias do evento cadastrados no painel, em ordem cronológica. */
function eventDays(store) {
  return [...(store.event_days || [])]
    .filter((e) => e?.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Janela de funcionamento do dia. Fechamento depois da meia-noite vira o dia seguinte. */
function windowFor(day, config) {
  const open = atTime(day, config.open);
  let close = atTime(day, config.close);
  if (close <= open) close = new Date(close.getTime() + 24 * 60 * MINUTE);
  return { open, close };
}

export function isOpenNow(store, now = new Date()) {
  for (const ev of eventDays(store)) {
    const day = parseDateKey(ev.date);
    const { open, close } = windowFor(day, ev);
    if (now >= open && now <= close) return true;
  }
  return false;
}

/** "18:00 às 22:30" do evento de hoje, ou aviso sobre o próximo evento. */
export function todayHoursLabel(store, now = new Date()) {
  const key = dateKey(now);
  const days = eventDays(store);
  const today = days.find((e) => e.date === key);
  if (today) return `${today.open} às ${today.close}`;

  const next = days.find((e) => e.date > key);
  if (!next) return 'Nenhum evento agendado';
  const d = parseDateKey(next.date);
  return `Próximo evento: ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${next.open}`;
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

/** Dias de evento com pedidos ainda abertos (dentro do prazo) e com horário livre. */
export function availableDays(store, now = new Date()) {
  const cutoff = Math.max(0, store.order_cutoff_days ?? 1);
  const todayStart = startOfDay(now);
  const days = [];

  for (const ev of eventDays(store)) {
    const day = parseDateKey(ev.date);
    if (day < todayStart) continue; // evento já passou

    const lastOrderDay = addDays(day, -cutoff);
    if (todayStart > lastOrderDay) continue; // prazo de pedido já encerrou

    const slots = slotsFor(day, ev, store, now);
    if (!slots.length) continue;

    const offset = Math.round((day.getTime() - todayStart.getTime()) / DAY);
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

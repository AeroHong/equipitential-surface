// <input type="datetime-local">의 min 값용 — 로컬 시간 기준 "지금"을 YYYY-MM-DDTHH:mm으로.
export function nowForDatetimeLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

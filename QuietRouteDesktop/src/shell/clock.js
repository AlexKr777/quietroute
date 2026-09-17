(function attachQuietRouteClock(globalScope) {
  function padClockPart(value) {
    return String(value).padStart(2, '0')
  }

  function formatLocalClock(date = new Date()) {
    return `${padClockPart(date.getHours())}:${padClockPart(date.getMinutes())}`
  }

  function getDelayUntilNextMinute(date = new Date()) {
    const elapsedInMinute = date.getSeconds() * 1000 + date.getMilliseconds()
    return Math.max(1, 60_001 - elapsedInMinute)
  }

  const api = {
    formatLocalClock,
    getDelayUntilNextMinute,
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = api
  }

  globalScope.QuietRouteClock = api
})(typeof window !== 'undefined' ? window : globalThis)
